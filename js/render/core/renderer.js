// Copyright 2018 The Immersive Web Community Group
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { CAP, MAT_STATE, RENDER_ORDER, stateToBlendFunc } from "./material.js";
import { Node } from "./node.js";
import { Program } from "./program.js";
import { DataTexture, VideoTexture } from "./texture.js";
import { mat4, vec3 } from "../math/gl-matrix.js";
import { lcb, rcb } from "../../handle_scenes.js";
import { buttonState } from "./controllerInput.js";
import * as cg from "./cg.js";

export const ATTRIB = {
  POSITION: 1,
  NORMAL: 2,
  TANGENT: 3,
  TEXCOORD_0: 4,
  TEXCOORD_1: 5,
  COLOR_0: 6,
};

export const ATTRIB_MASK = {
  POSITION: 0x0001,
  NORMAL: 0x0002,
  TANGENT: 0x0004,
  TEXCOORD_0: 0x0008,
  TEXCOORD_1: 0x0010,
  COLOR_0: 0x0020,
};

const GL = WebGLRenderingContext; // For enums

const DEF_LIGHT_DIR1 = new Float32Array([-0.1, -1, 1]);
const DEF_LIGHT_DIR2 = new Float32Array([0, -2.5, 0]);
const DEF_LIGHT_COLOR = new Float32Array([10.0, 10.0, 10.0]);

const PRECISION_REGEX = new RegExp("precision (lowp|mediump|highp) float;");

const VERTEX_SHADER_SINGLE_ENTRY = `
uniform mat4 PROJECTION_MATRIX, VIEW_MATRIX, MODEL_MATRIX;

void main() {
  gl_Position = vertex_main(PROJECTION_MATRIX, VIEW_MATRIX, MODEL_MATRIX);
}
`;

const VERTEX_SHADER_MULTI_ENTRY = `
#ERROR Multiview rendering is not implemented
void main() {
  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_ENTRY = `
void main() {
  gl_FragColor = fragment_main();
}
`; 

const Clay_VERTEX_SOURCE = `#version 300 es // NEWER VERSION OF GLSL
precision highp float; // HIGH PRECISION FLOATS

const int NBLOBS = 20;

uniform   mat4  uProj, uView, uModel, uInvModel;
uniform   vec4  uDiffuse[NBLOBS], uSpecular[NBLOBS];
uniform   mat3  uRSF[NBLOBS], uRSI[NBLOBS];
uniform   vec3  uTranslate[NBLOBS];
uniform   float uTime, uAspectRatio, uBlobby, uNoisy;

in vec3  aPos, aRot, aWts0, aWts1;
in vec2  aUV;
in float aRGB;

out   vec4  vDiffuse, vSpecular;
out   vec3  vAPos, vPos, vNor, vRGB;
out   vec2  vUV;
out   float vWeights[6];

float noise(vec3 point) { 
  float r = 0.; for (int i=0;i<16;i++) {
  vec3 D, p = point + mod(vec3(i,i/4,i/8) , vec3(4.0,2.0,2.0)) +
       1.7*sin(vec3(i,5*i,8*i)), C=floor(p), P=p-C-.5, A=abs(P);
  C += mod(C.x+C.y+C.z,2.) * step(max(A.yzx,A.zxy),A) * sign(P);
  D=34.*sin(987.*float(i)+876.*C+76.*C.yzx+765.*C.zxy);P=p-C-.5;
  r+=sin(6.3*dot(P,fract(D)-.5))*pow(max(0.,1.-2.*dot(P,P)),4.);
  } 
  return .5 * sin(r); 
}

   vec3 unpack0(vec3 ab) {
      return ab / 40000. * 2. - 1.;
   }

   vec3 unpack1(vec3 ab) {
      return mod(ab, 1.) * 2. - 1.;
   }

   vec3 unpackRGB(float rgb) {
      return mod(vec3(rgb, rgb / 256., rgb / 65536.), 1.);
   }

   void main() {

      for (int i = 0 ; i < 3 ; i++) {
         vWeights[i  ] = aWts0[i];
         vWeights[3+i] = aWts1[i];
      }

      vec4 apos = vec4(aPos, 1.);
      vec4 pos = apos;

      vec3 aNor = unpack0(aRot);
      vec4 anor = vec4(aNor, 0.);
      vec4 nor = anor;

      vec3 P = aPos, N = aNor;

      // IF THIS IS A BLOBBY OBJECT
      // BLEND WEIGHTED POSITIONS, NORMALS AND COLORS FROM COMPONENT OBJECTS

      if (uBlobby > 0.) {
         P = vec3(0.);
         N = vec3(0.);
         vDiffuse = vec4(0.);
         vSpecular = vec4(0.);
         for (int i = 0 ; i < 6 ; i++)
            if (vWeights[i] > 0.) {
               int n = int(vWeights[i]);
               float t = mod(vWeights[i], 1.);
               P += t * (uRSF[n] * aPos + uTranslate[n]);
               N += t * (aNor * uRSI[n]);
               t = t * t * (3. - 2. * t);
               vDiffuse += t * uDiffuse[n];
               vSpecular += t * uSpecular[n];
            }
      }

      pos = uView * uModel * vec4(P, 1.);
      // pos.z += 1. / uProj[2].w;
      pos = uProj * pos;

      nor = vec4(N, 0.) * uInvModel;

      vAPos = aPos;
      vPos = pos.xyz;
      vNor = nor.xyz;
      vRGB = unpackRGB(aRGB);
      vUV  = aUV;

      if (uNoisy > 0.) {
         float t = .5 + noise(7. * aPos * uNoisy);
         t = t * t * (3. - t - t);
         t = t * t * (3. - t - t);
         vDiffuse = vec4((.8 + .2 * t) * vDiffuse.rgb, vDiffuse.a);
      }

      gl_Position = pos;
   }
`; 

const Clay_FRAG_SOURCE = `#version 300 es // NEWER VERSION OF GLSL
precision highp float; // HIGH PRECISION FLOATS

const int nl = 2;                    // NUMBER OF LIGHTS

 uniform float uTime;                // TIME, IN SECONDS
 uniform float uBlobby;              // BLOBBY FLAG
 uniform float uOpacity;
 uniform vec3  uLDir[nl], uLCol[nl]; // LIGHTING
 uniform mat4  uPhong;               // MATERIAL
 uniform sampler2D uSampler0;
 uniform float uTexture;

 uniform int uMirrored;
 uniform int uProcedure;
 uniform int uTransparentTexture;
 uniform int uVideo;
 uniform int uWhitescreen;

 in vec3  vAPos, vPos, vNor, vRGB;   // POSITION, NORMAL, COLOR
 in float vWeights[6];               // BLOBBY WEIGHTS
 in vec4  vDiffuse, vSpecular;
 in vec2  vUV;

 out vec4 fragColor; // RESULT WILL GO HERE

float noise(vec3 point) { 
  float r = 0.; for (int i=0;i<16;i++) {
  vec3 D, p = point + mod(vec3(i,i/4,i/8) , vec3(4.0,2.0,2.0)) +
       1.7*sin(vec3(i,5*i,8*i)), C=floor(p), P=p-C-.5, A=abs(P);
  C += mod(C.x+C.y+C.z,2.) * step(max(A.yzx,A.zxy),A) * sign(P);
  D=34.*sin(987.*float(i)+876.*C+76.*C.yzx+765.*C.zxy);P=p-C-.5;
  r+=sin(6.3*dot(P,fract(D)-.5))*pow(max(0.,1.-2.*dot(P,P)),4.);
  } 
  return .5 * sin(r); 
}

 void main() {
    vec3 ambient, diffuse;
    vec4 specular, t;

    if (uBlobby <= 0.) {
       ambient  = uPhong[0].rgb;
       diffuse  = uPhong[1].rgb;
       specular = uPhong[2].rgba;
       t        = uPhong[3].rgba;
    }
    else {
       ambient = vDiffuse.rgb * (1. - vDiffuse.a);
       diffuse = vDiffuse.rgb * vDiffuse.a;
       specular = vSpecular;
       t = vec4(0.);
    }

    vec3 color = ambient + t.r * (.5 + dot(diffuse, diffuse));
    vec3 N = normalize(vNor);
    for (int n = 0 ; n < nl ; n++) {
       vec3 R = 2. * dot(uLDir[n], N) * N - uLDir[n];
       color += uLCol[n] * (
                 diffuse * max(0., dot(uLDir[n], N))
               + specular.rgb * pow(max(0., R.z), specular.w)
       );
    }

    float opacity = uOpacity;

    if (uVideo == 0) {
       vec4 texture = texture(uSampler0, vUV);
       color *= mix(vec3(1.), texture.rgb, texture.a * uTexture);
       if (uTransparentTexture == 1) {
	  color = 5. * ambient;
          opacity *= max(0., 1. - (texture.r + texture.g + texture.b) / 3.);
       }
    }

    // IF VIDEO TEXTURE, REVERSE CAMERA IMAGE AND IMPLEMENT GREENSCREEN.

    if (uVideo == 1) {
       vec4 video = texture(uSampler0, uMirrored > 0 ? vec2(-vUV.x,vUV.y) : vUV);
       color = video.rgb;
       float s = 4.;

       if (uWhitescreen > 0) {
           float sum = color.r + color.g + color.b,
	         diff = max(abs(color.r / color.g - 1.),
	                max(abs(color.g / color.b - 1.),
	                    abs(color.b / color.r - 1.)));
           if (sum > 1.8 && diff < .2)
             color = mix(color, vec3(0.,1.,0.), 0.4 * (sum - diff));
           s = 24.;
       }

       if (color.g > .1)
          opacity *= min(1., 1. - s*(1.75*color.g - (color.r + color.b)));
       if (uWhitescreen == 0)
          color.g = mix(min(color.g, color.r), color.g, .5 * (2. * color.g - 1.));

       color = color * color;
    }

    if (uProcedure == 1) {
       opacity = sign(noise(2. * vAPos + vec3(uTime,uTime,uTime)));
    }

    fragColor = vec4(sqrt(color * vRGB), 1.0) * opacity;
 }
`; 

function isPowerOfTwo(n) {
  return (n & (n - 1)) === 0;
}

// Creates a WebGL context and initializes it with some common default state.
export function createWebGLContext(glAttribs) {
  glAttribs = glAttribs || { alpha: false };

  let webglCanvas = document.createElement("canvas");
  let contextTypes = glAttribs.webgl2
    ? ["webgl2"]
    : ["webgl", "experimental-webgl"];
  let context = null;

  for (let contextType of contextTypes) {
    context = webglCanvas.getContext(contextType, glAttribs);
    if (context) {
      break;
    }
  }

  if (!context) {
    let webglType = glAttribs.webgl2 ? "WebGL 2" : "WebGL";
    console.error("This browser does not support " + webglType + ".");
    return null;
  }

  return context;
}

export class RenderView {
  constructor(projectionMatrix, viewTransform, viewport = null, eye = "left") {
    this.projectionMatrix = projectionMatrix;
    this.viewport = viewport;
    // If an eye isn't given the left eye is assumed.
    this._eye = eye;
    this._eyeIndex = eye == "left" ? 0 : 1;

    // Compute the view matrix
    if (viewTransform instanceof Float32Array) {
      this._viewMatrix = mat4.clone(viewTransform);
      this.viewTransform = new XRRigidTransform(); // TODO
    } else {
      this.viewTransform = viewTransform;
      this._viewMatrix = viewTransform.inverse.matrix;

      // Alternative view matrix code path
      /*this._viewMatrix = mat4.create();
      let q = viewTransform.orientation;
      let t = viewTransform.position;
      mat4.fromRotationTranslation(
          this._viewMatrix,
          [q.x, q.y, q.z, q.w],
          [t.x, t.y, t.z]
      );
      mat4.invert(this._viewMatrix, this._viewMatrix);*/
    }
  }

  get viewMatrix() {
    return this._viewMatrix;
  }

  get eye() {
    return this._eye;
  }

  set eye(value) {
    this._eye = value;
    this._eyeIndex = value == "left" ? 0 : 1;
  }

  get eyeIndex() {
    return this._eyeIndex;
  }
}

class RenderBuffer {
  constructor(target, usage, buffer, length = 0) {
    this._target = target;
    this._usage = usage;
    this._length = length;
    if (buffer instanceof Promise) {
      this._buffer = null;
      this._promise = buffer.then((buffer) => {
        this._buffer = buffer;
        return this;
      });
    } else {
      this._buffer = buffer;
      this._promise = Promise.resolve(this);
    }
  }

  waitForComplete() {
    return this._promise;
  }
}

class RenderPrimitiveAttribute {
  constructor(primitiveAttribute) {
    this._attrib_index = ATTRIB[primitiveAttribute.name];
    this._componentCount = primitiveAttribute.componentCount;
    this._componentType = primitiveAttribute.componentType;
    this._stride = primitiveAttribute.stride;
    this._byteOffset = primitiveAttribute.byteOffset;
    this._normalized = primitiveAttribute.normalized;
  }
}

class RenderPrimitiveAttributeBuffer {
  constructor(buffer) {
    this._buffer = buffer;
    this._attributes = [];
  }
}

class RenderPrimitive {
  constructor(primitive) {
    this._activeFrameId = 0;
    this._instances = [];
    this._material = null;

    this.setPrimitive(primitive);
  }

  setPrimitive(primitive) {
    this._mode = primitive.mode;
    this._elementCount = primitive.elementCount;
    this._promise = null;
    this._vao = null;
    this._complete = false;
    this._attributeBuffers = [];
    this._attributeMask = 0;

    for (let attribute of primitive.attributes) {
      this._attributeMask |= ATTRIB_MASK[attribute.name];
      let renderAttribute = new RenderPrimitiveAttribute(attribute);
      let foundBuffer = false;
      for (let attributeBuffer of this._attributeBuffers) {
        if (attributeBuffer._buffer == attribute.buffer) {
          attributeBuffer._attributes.push(renderAttribute);
          foundBuffer = true;
          break;
        }
      }
      if (!foundBuffer) {
        let attributeBuffer = new RenderPrimitiveAttributeBuffer(
          attribute.buffer
        );
        attributeBuffer._attributes.push(renderAttribute);
        this._attributeBuffers.push(attributeBuffer);
      }
    }

    this._indexBuffer = null;
    this._indexByteOffset = 0;
    this._indexType = 0;

    if (primitive.indexBuffer) {
      this._indexByteOffset = primitive.indexByteOffset;
      this._indexType = primitive.indexType;
      this._indexBuffer = primitive.indexBuffer;
    }

    if (primitive._min) {
      this._min = vec3.clone(primitive._min);
      this._max = vec3.clone(primitive._max);
    } else {
      this._min = null;
      this._max = null;
    }

    if (this._material != null) {
      this.waitForComplete(); // To flip the _complete flag.
    }
  }

  setRenderMaterial(material) {
    this._material = material;
    this._promise = null;
    this._complete = false;

    if (this._material != null) {
      this.waitForComplete(); // To flip the _complete flag.
    }
  }

  markActive(frameId) {
    if (this._complete && this._activeFrameId != frameId) {
      if (this._material) {
        if (!this._material.markActive(frameId)) {
          return;
        }
      }
      this._activeFrameId = frameId;
    }
  }

  get samplers() {
    return this._material._samplerDictionary;
  }

  get uniforms() {
    return this._material._uniform_dictionary;
  }

  waitForComplete() {
    if (!this._promise) {
      if (!this._material) {
        return Promise.reject("RenderPrimitive does not have a material");
      }

      let completionPromises = [];

      for (let attributeBuffer of this._attributeBuffers) {
        if (!attributeBuffer._buffer._buffer) {
          completionPromises.push(attributeBuffer._buffer._promise);
        }
      }

      if (this._indexBuffer && !this._indexBuffer._buffer) {
        completionPromises.push(this._indexBuffer._promise);
      }

      this._promise = Promise.all(completionPromises).then(() => {
        this._complete = true;
        return this;
      });
    }
    return this._promise;
  }
}

export class RenderTexture {
  constructor(texture) {
    this._texture = texture;
    this._complete = false;
    this._activeFrameId = 0;
    this._activeCallback = null;
  }

  markActive(frameId) {
    if (this._activeCallback && this._activeFrameId != frameId) {
      this._activeFrameId = frameId;
      this._activeCallback(this);
    }
  }
}

const inverseMatrix = mat4.create();

function setCap(gl, glEnum, cap, prevState, state) {
  let change = (state & cap) - (prevState & cap);
  if (!change) {
    return;
  }

  if (change > 0) {
    gl.enable(glEnum);
  } else {
    gl.disable(glEnum);
  }
}

class RenderMaterialSampler {
  constructor(renderer, materialSampler, index) {
    this._renderer = renderer;
    this._uniformName = materialSampler._uniformName;
    this._renderTexture = renderer._getRenderTexture(materialSampler._texture);
    this._index = index;
  }

  set texture(value) {
    this._renderTexture = this._renderer._getRenderTexture(value);
  }
}

class RenderMaterialUniform {
  constructor(materialUniform) {
    this._uniformName = materialUniform._uniformName;
    this._uniform = null;
    this._length = materialUniform._length;
    if (materialUniform._value instanceof Array) {
      this._value = new Float32Array(materialUniform._value);
    } else {
      this._value = new Float32Array([materialUniform._value]);
    }
  }

  set value(value) {
    if (this._value.length == 1) {
      this._value[0] = value;
    } else {
      for (let i = 0; i < this._value.length; ++i) {
        this._value[i] = value[i];
      }
    }
  }
}

class RenderMaterial {
  constructor(renderer, material, program) {
    this._program = program;
    this._state = material.state._state;
    this._activeFrameId = 0;
    this._completeForActiveFrame = false;

    this._samplerDictionary = {};
    this._samplers = [];
    for (let i = 0; i < material._samplers.length; ++i) {
      let renderSampler = new RenderMaterialSampler(
        renderer,
        material._samplers[i],
        i
      );
      this._samplers.push(renderSampler);
      this._samplerDictionary[renderSampler._uniformName] = renderSampler;
    }

    this._uniform_dictionary = {};
    this._uniforms = [];
    for (let uniform of material._uniforms) {
      let renderUniform = new RenderMaterialUniform(uniform);
      this._uniforms.push(renderUniform);
      this._uniform_dictionary[renderUniform._uniformName] = renderUniform;
    }

    this._firstBind = true;

    this._renderOrder = material.renderOrder;
    if (this._renderOrder == RENDER_ORDER.DEFAULT) {
      if (this._state & CAP.BLEND) {
        this._renderOrder = RENDER_ORDER.TRANSPARENT;
      } else {
        this._renderOrder = RENDER_ORDER.OPAQUE;
      }
    }
  }

  bind(gl) {
    // First time we do a binding, cache the uniform locations and remove
    // unused uniforms from the list.
    if (this._firstBind) {
      for (let i = 0; i < this._samplers.length; ) {
        let sampler = this._samplers[i];
        if (!this._program.uniform[sampler._uniformName]) {
          this._samplers.splice(i, 1);
          continue;
        }
        ++i;
      }

      for (let i = 0; i < this._uniforms.length; ) {
        let uniform = this._uniforms[i];
        uniform._uniform = this._program.uniform[uniform._uniformName];
        if (!uniform._uniform) {
          this._uniforms.splice(i, 1);
          continue;
        }
        ++i;
      }
      this._firstBind = false;
    }

    for (let sampler of this._samplers) {
      gl.activeTexture(gl.TEXTURE0 + sampler._index);
      if (sampler._renderTexture && sampler._renderTexture._complete) {
        gl.bindTexture(gl.TEXTURE_2D, sampler._renderTexture._texture);
      } else {
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
    }

    for (let uniform of this._uniforms) {
      switch (uniform._length) {
        case 1:
          gl.uniform1fv(uniform._uniform, uniform._value);
          break;
        case 2:
          gl.uniform2fv(uniform._uniform, uniform._value);
          break;
        case 3:
          gl.uniform3fv(uniform._uniform, uniform._value);
          break;
        case 4:
          gl.uniform4fv(uniform._uniform, uniform._value);
          break;
      }
    }
  }

  markActive(frameId) {
    if (this._activeFrameId != frameId) {
      this._activeFrameId = frameId;
      this._completeForActiveFrame = true;
      for (let i = 0; i < this._samplers.length; ++i) {
        let sampler = this._samplers[i];
        if (sampler._renderTexture) {
          if (!sampler._renderTexture._complete) {
            this._completeForActiveFrame = false;
            break;
          }
          sampler._renderTexture.markActive(frameId);
        }
      }
    }
    return this._completeForActiveFrame;
  }

  // Material State fetchers
  get cullFace() {
    return !!(this._state & CAP.CULL_FACE);
  }
  get blend() {
    return !!(this._state & CAP.BLEND);
  }
  get depthTest() {
    return !!(this._state & CAP.DEPTH_TEST);
  }
  get stencilTest() {
    return !!(this._state & CAP.STENCIL_TEST);
  }
  get colorMask() {
    return !!(this._state & CAP.COLOR_MASK);
  }
  get depthMask() {
    return !!(this._state & CAP.DEPTH_MASK);
  }
  get stencilMask() {
    return !!(this._state & CAP.STENCIL_MASK);
  }
  get depthFunc() {
    return (
      ((this._state & MAT_STATE.DEPTH_FUNC_RANGE) >>
        MAT_STATE.DEPTH_FUNC_SHIFT) +
      GL.NEVER
    );
  }
  get blendFuncSrc() {
    return stateToBlendFunc(
      this._state,
      MAT_STATE.BLEND_SRC_RANGE,
      MAT_STATE.BLEND_SRC_SHIFT
    );
  }
  get blendFuncDst() {
    return stateToBlendFunc(
      this._state,
      MAT_STATE.BLEND_DST_RANGE,
      MAT_STATE.BLEND_DST_SHIFT
    );
  }

  // Only really for use from the renderer
  _capsDiff(otherState) {
    return (
      (otherState & MAT_STATE.CAPS_RANGE) ^ (this._state & MAT_STATE.CAPS_RANGE)
    );
  }

  _blendDiff(otherState) {
    if (!(this._state & CAP.BLEND)) {
      return 0;
    }
    return (
      (otherState & MAT_STATE.BLEND_FUNC_RANGE) ^
      (this._state & MAT_STATE.BLEND_FUNC_RANGE)
    );
  }

  _depthFuncDiff(otherState) {
    if (!(this._state & CAP.DEPTH_TEST)) {
      return 0;
    }
    return (
      (otherState & MAT_STATE.DEPTH_FUNC_RANGE) ^
      (this._state & MAT_STATE.DEPTH_FUNC_RANGE)
    );
  }
}

export class Renderer {
  constructor(gl) {
    this._gl = gl || createWebGLContext();
    this._frameId = 0;
    this._programCache = {};
    this._textureCache = {};
    this._renderPrimitives = Array(RENDER_ORDER.DEFAULT);
    this._cameraPositions = [];

    this._vaoExt = gl.createVertexArray();

    let fragHighPrecision = gl.getShaderPrecisionFormat(
      gl.FRAGMENT_SHADER,
      gl.HIGH_FLOAT
    );
    this._defaultFragPrecision =
      fragHighPrecision.precision > 0 ? "highp" : "mediump";

    this._depthMaskNeedsReset = false;
    this._colorMaskNeedsReset = false;

    this._globalLightColor = vec3.clone(DEF_LIGHT_COLOR);
    this._globalLightDir1 = vec3.clone(DEF_LIGHT_DIR1);
    this._globalLightDir2 = vec3.clone(DEF_LIGHT_DIR2);
  }

  get gl() {
    return this._gl;
  }

  set globalLightColor(value) {
    vec3.copy(this._globalLightColor, value);
  }

  get globalLightColor() {
    return vec3.clone(this._globalLightColor);
  }

  set globalLightDir1(value1) {
    vec3.copy(this._globalLightDir1, value1);
  }

  set globalLightDir2(value2) {
    vec3.copy(this._globalLightDir2, value2);
  }

  get globalLightDir1() {
    return vec3.clone(this._globalLightDir1);
  }

  get globalLightDir2() {
    return vec3.clone(this._globalLightDir2);
  }

  createRenderBuffer(target, data, usage) {
    if (usage === undefined) usage = GL.STATIC_DRAW;
    let gl = this._gl;
    let glBuffer = gl.createBuffer();

    if (data instanceof Promise) {
      let renderBuffer = new RenderBuffer(
        target,
        usage,
        data.then((data) => {
          gl.bindBuffer(target, glBuffer);
          gl.bufferData(target, data, usage);
          renderBuffer._length = data.byteLength;
          return glBuffer;
        })
      );
      return renderBuffer;
    } else {
      gl.bindBuffer(target, glBuffer);
      gl.bufferData(target, data, usage);
      return new RenderBuffer(target, usage, glBuffer, data.byteLength);
    }
  }

  updateRenderBuffer(buffer, data, offset = 0) {
    if (buffer._buffer) {
      let gl = this._gl;
      gl.bindBuffer(buffer._target, buffer._buffer);
      if (offset == 0 && buffer._length == data.byteLength) {
        gl.bufferData(buffer._target, data, buffer._usage);
      } else {
        gl.bufferSubData(buffer._target, offset, data);
      }
    } else {
      buffer.waitForComplete().then((buffer) => {
        this.updateRenderBuffer(buffer, data, offset);
      });
    }
  }

  createRenderPrimitive(primitive, material) {
    let renderPrimitive = new RenderPrimitive(primitive);

    let program = this._getMaterialProgram(material, renderPrimitive);
    let renderMaterial = new RenderMaterial(this, material, program);
    renderPrimitive.setRenderMaterial(renderMaterial);

    if (!this._renderPrimitives[renderMaterial._renderOrder]) {
      this._renderPrimitives[renderMaterial._renderOrder] = [];
    }

    this._renderPrimitives[renderMaterial._renderOrder].push(renderPrimitive);

    return renderPrimitive;
  }

  createMesh(primitive, material) {
    let meshNode = new Node();
    meshNode.addRenderPrimitive(
      this.createRenderPrimitive(primitive, material)
    );
    return meshNode;
  }

  drawViews(views, rootNode, time) {
    if (!rootNode) {
      return;
    }

    let gl = this._gl;
    this._frameId++;

    rootNode.markActive(this._frameId);

    // If there's only one view then flip the algorithm a bit so that we're only
    // setting the viewport once.
    if (views.length == 1 && views[0].viewport) {
      let vp = views[0].viewport;
      this._gl.viewport(vp.x, vp.y, vp.width, vp.height);
    }

    // Get the positions of the 'camera' for each view matrix.
    for (let i = 0; i < views.length; ++i) {
      if (this._cameraPositions.length <= i) {
        this._cameraPositions.push(vec3.create());
      }
      let p = views[i].viewTransform.position;
      this._cameraPositions[i][0] = p.x;
      this._cameraPositions[i][1] = p.y;
      this._cameraPositions[i][2] = p.z;

      /*mat4.invert(inverseMatrix, views[i].viewMatrix);
      let cameraPosition = this._cameraPositions[i];
      vec3.set(cameraPosition, 0, 0, 0);
      vec3.transformMat4(cameraPosition, cameraPosition, inverseMatrix);*/
    }

    // Draw each set of render primitives in order
    for (let renderPrimitives of this._renderPrimitives) {
      if (renderPrimitives && renderPrimitives.length) {
        this._drawRenderPrimitiveSet(views, renderPrimitives);
      }
    }

    if (this._vaoExt) {
      this._gl.bindVertexArray(null);
    }

    if (this._depthMaskNeedsReset) {
      gl.depthMask(true);
    }
    if (this._colorMaskNeedsReset) {
      gl.colorMask(true, true, true, true);
    }
    window.views = views;
    window.clay.clayPgm.initBuffer(this._gl);
    this._drawClay(views);
  }

  _drawRenderPrimitiveSet(views, renderPrimitives) {
    let gl = this._gl;
    let program = null;
    let material = null;

    // Loop through every primitive known to the renderer.
    for (let primitive of renderPrimitives) {
      // Skip over those that haven't been marked as active for this frame.
      if (primitive._activeFrameId != this._frameId) {
        continue;
      }

      // Bind the primitive material's program if it's different than the one we
      // were using for the previous primitive.
      // TODO: The ording of this could be more efficient.
      if (program != primitive._material._program) {
        program = primitive._material._program;
        program.use();

        if (program.uniform.LIGHT_DIRECTION1) {
          gl.uniform3fv(
            program.uniform.LIGHT_DIRECTION1,
            this._globalLightDir1
          );
        }

        if (program.uniform.LIGHT_DIRECTION2) {
          gl.uniform3fv(
            program.uniform.LIGHT_DIRECTION2,
            this._globalLightDir2
          );
        }

        if (program.uniform.LIGHT_COLOR) {
          gl.uniform3fv(program.uniform.LIGHT_COLOR, this._globalLightColor);
        }

        if (views.length == 1) {
          gl.uniformMatrix4fv(
            program.uniform.PROJECTION_MATRIX,
            false,
            views[0].projectionMatrix
          );
          gl.uniformMatrix4fv(
            program.uniform.VIEW_MATRIX,
            false,
            views[0].viewMatrix
          );
          gl.uniform3fv(
            program.uniform.CAMERA_POSITION,
            this._cameraPositions[0]
          );
          gl.uniform1i(program.uniform.EYE_INDEX, views[0].eyeIndex);
        }
      }

      if (material != primitive._material) {
        this._bindMaterialState(primitive._material, material);
        primitive._material.bind(gl, program, material);
        material = primitive._material;
      }

      if (this._vaoExt) {
        if (primitive._vao) {
          this._gl.bindVertexArray(primitive._vao);
        } else {
          primitive._vao = gl.createVertexArray();
          this._gl.bindVertexArray(primitive._vao);
          this._bindPrimitive(primitive);
        }
      } else {
        this._bindPrimitive(primitive, attribMask);
        attribMask = primitive._attributeMask;
      }

      for (let i = 0; i < views.length; ++i) {
        let view = views[i];
        if (views.length > 1) {
          if (view.viewport) {
            let vp = view.viewport;
            gl.viewport(vp.x, vp.y, vp.width, vp.height);
          }
          gl.uniformMatrix4fv(
            program.uniform.PROJECTION_MATRIX,
            false,
            view.projectionMatrix
          );
          gl.uniformMatrix4fv(
            program.uniform.VIEW_MATRIX,
            false,
            view.viewMatrix
          );
          gl.uniform3fv(
            program.uniform.CAMERA_POSITION,
            this._cameraPositions[i]
          );
          gl.uniform1i(program.uniform.EYE_INDEX, view.eyeIndex);
        }

        for (let instance of primitive._instances) {
          if (instance._activeFrameId != this._frameId) {
            continue;
          }

          gl.uniformMatrix4fv(
            program.uniform.MODEL_MATRIX,
            false,
            instance.worldMatrix
          );

          if (primitive._indexBuffer) {
            gl.drawElements(
              primitive._mode,
              primitive._elementCount,
              primitive._indexType,
              primitive._indexByteOffset
            );
          } else {
            gl.drawArrays(primitive._mode, 0, primitive._elementCount);
          }
        }
      }
    }
  }

  _drawClay(views,isTriangleMesh) {
    let gl = this._gl;
    window.clay.gl = gl;
    if (!window.clay.clayPgm.program) {
      window.clay.clayPgm.program = new Program(
        gl,
        Clay_VERTEX_SOURCE,
        Clay_FRAG_SOURCE
      );
    }

    window.clay.clayPgm.program.use();
    let pgm = window.clay.clayPgm.program;
    if (!window.clay.clayPgm.vao) {
      window.clay.clayPgm.initVAO(gl);
      gl.bindVertexArray(window.clay.clayPgm.vao);
      gl.useProgram(pgm.program);
      window.clay.clayPgm.initBuffer(gl);
    }

    let setUniform = (type, name, a, b, c, d, e, f) => {
      let loc = gl.getUniformLocation(pgm.program, name);
      (gl['uniform' + type])(loc, a, b, c, d, e, f);
   }
   
   let drawArrays = () => {
      gl.drawArrays(!isTriangleMesh ? gl.TRIANGLES : gl.TRIANGLE_STRIP, 0, window.clay.clayPgm.mesh.length / 16); // CHANGE THIS TO A VARIABLE, NOT HARD-CODED
   }
    gl.bindBuffer(gl.ARRAY_BUFFER, window.clay.clayPgm.buffer);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    // gl.clearDepth(-1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.CULL_FACE);
    //gl.cullFace(gl.FRONT);

    let bpe = Float32Array.BYTES_PER_ELEMENT;
    let aPos = gl.getAttribLocation(pgm.program, "aPos");
    let new_vertex_size = 16;
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(
      aPos,
      3,
      gl.FLOAT,
      false,
      bpe * new_vertex_size,
      bpe * 0
    );

    let aRot = gl.getAttribLocation(pgm.program, "aRot");
    gl.enableVertexAttribArray(aRot);
    gl.vertexAttribPointer(
      aRot,
      3,
      gl.FLOAT,
      false,
      bpe * new_vertex_size,
      bpe * 3
    );

    let aUV = gl.getAttribLocation(pgm.program, "aUV");
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(
      aUV,
      2,
      gl.FLOAT,
      false,
      bpe * new_vertex_size,
      bpe * 6
    );

    let aRGB = gl.getAttribLocation(pgm.program, "aRGB");
    gl.enableVertexAttribArray(aRGB);
    gl.vertexAttribPointer(
      aRGB,
      1,
      gl.FLOAT,
      false,
      bpe * new_vertex_size,
      bpe * 8
    );

    let aWts0 = gl.getAttribLocation(pgm.program, 'aWts0');
    gl.enableVertexAttribArray(aWts0);
    gl.vertexAttribPointer(aWts0, 3, gl.FLOAT, false, new_vertex_size * bpe, 9 * bpe);

    let aWts1 = gl.getAttribLocation(pgm.program, 'aWts1');
    gl.enableVertexAttribArray(aWts1);
    gl.vertexAttribPointer(aWts1, 3, gl.FLOAT, false, new_vertex_size * bpe, 12 * bpe);
    window.clay.animate(views); 

    if (clay.handsWidget)
       clay.handsWidget.update();

/*
	Still to do: register labels so they become responsive buttons.
*/

    if (lcb) {
       let updateCB = cb => {
          let m;
          if (window.handtracking)
	     m = clay.handsWidget.matrix[cb.hand];
          cb.update(m);
          cb.down = m ? clay.handsWidget.pinch[cb.hand]
                     || clay.handsWidget.bend[cb.hand] > 1
	              : buttonState[cb.hand][0].pressed;
          cb.click = cb.downPrev && ! cb.down;
          cb.downPrev = cb.down;
       }
       updateCB(lcb);
       updateCB(rcb);
       for (let i = 0 ; i < clay.vrWidgets.nChildren() ; i++) {
          let obj = clay.vrWidgets.child(i);
          if (obj.getInfo()) {
             let lHit = lcb.hitLabel(obj);
             let rHit = rcb.hitLabel(obj);
	     obj.color(lHit && lcb.down || rHit && rcb.down ? [1,0,0] :
	               lHit || rHit ? [1,.5,.5] : [1,1,1]);
             if ((lHit || rHit) && (lcb.click || rcb.click))
	        window.chooseFlag(obj.getInfo());
          }
       }
    }
  }

  _getRenderTexture(texture) {
    if (!texture) {
      return null;
    }

    let key = texture.textureKey;
    if (!key) {
      throw new Error("Texure does not have a valid key");
    }

    if (key in this._textureCache) {
      return this._textureCache[key];
    } else {
      let gl = this._gl;
      let textureHandle = gl.createTexture();

      let renderTexture = new RenderTexture(textureHandle);
      this._textureCache[key] = renderTexture;

      if (texture instanceof DataTexture) {
        gl.bindTexture(gl.TEXTURE_2D, textureHandle);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          texture.format,
          texture.width,
          texture.height,
          0,
          texture.format,
          texture._type,
          texture._data
        );
        this._setSamplerParameters(texture);
        renderTexture._complete = true;
      } else {
        texture.waitForComplete().then(() => {
          gl.bindTexture(gl.TEXTURE_2D, textureHandle);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            texture.format,
            texture.format,
            gl.UNSIGNED_BYTE,
            texture.source
          );
          this._setSamplerParameters(texture);
          renderTexture._complete = true;

          if (texture instanceof VideoTexture) {
            // Once the video starts playing, set a callback to update it's
            // contents each frame.
            texture._video.addEventListener("playing", () => {
              renderTexture._activeCallback = () => {
                if (!texture._video.paused && !texture._video.waiting) {
                  gl.bindTexture(gl.TEXTURE_2D, textureHandle);
                  gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    texture.format,
                    texture.format,
                    gl.UNSIGNED_BYTE,
                    texture.source
                  );
                }
              };
            });
          }
        });
      }

      return renderTexture;
    }
  }

  _setSamplerParameters(texture) {
    let gl = this._gl;

    let sampler = texture.sampler;
    let powerOfTwo =
      isPowerOfTwo(texture.width) && isPowerOfTwo(texture.height);
    let mipmap = powerOfTwo && texture.mipmap;
    if (mipmap) {
      gl.generateMipmap(gl.TEXTURE_2D);
    }

    let minFilter =
      sampler.minFilter || (mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    let wrapS = sampler.wrapS || (powerOfTwo ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    let wrapT = sampler.wrapT || (powerOfTwo ? gl.REPEAT : gl.CLAMP_TO_EDGE);

    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MAG_FILTER,
      sampler.magFilter || gl.LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
  }

  _getProgramKey(name, defines) {
    let key = `${name}:`;

    for (let define in defines) {
      key += `${define}=${defines[define]},`;
    }

    return key;
  }

  _getMaterialProgram(material, renderPrimitive) {
    let materialName = material.materialName;
    let vertexSource = material.vertexSource;
    let fragmentSource = material.fragmentSource;

    // These should always be defined for every material
    if (materialName == null) {
      throw new Error("Material does not have a name");
    }
    if (vertexSource == null) {
      throw new Error(
        `Material "${materialName}" does not have a vertex source`
      );
    }
    if (fragmentSource == null) {
      throw new Error(
        `Material "${materialName}" does not have a fragment source`
      );
    }

    let defines = material.getProgramDefines(renderPrimitive);
    let key = this._getProgramKey(materialName, defines);

    if (key in this._programCache) {
      return this._programCache[key];
    } else {
      let multiview = false; // Handle this dynamically later
      let fullVertexSource = vertexSource;
      fullVertexSource += multiview
        ? VERTEX_SHADER_MULTI_ENTRY
        : VERTEX_SHADER_SINGLE_ENTRY;

      let precisionMatch = fragmentSource.match(PRECISION_REGEX);
      let fragPrecisionHeader = precisionMatch
        ? ""
        : `precision ${this._defaultFragPrecision} float;\n`;

      let fullFragmentSource = fragPrecisionHeader + fragmentSource;
      fullFragmentSource += FRAGMENT_SHADER_ENTRY;

      let program = new Program(
        this._gl,
        fullVertexSource,
        fullFragmentSource,
        ATTRIB,
        defines
      );
      this._programCache[key] = program;

      program.onNextUse((program) => {
        // Bind the samplers to the right texture index. This is constant for
        // the lifetime of the program.
        for (let i = 0; i < material._samplers.length; ++i) {
          let sampler = material._samplers[i];
          let uniform = program.uniform[sampler._uniformName];
          if (uniform) {
            this._gl.uniform1i(uniform, i);
          }
        }
      });

      return program;
    }
  }

  _bindPrimitive(primitive, attribMask) {
    let gl = this._gl;

    // If the active attributes have changed then update the active set.
    if (attribMask != primitive._attributeMask) {
      for (let attrib in ATTRIB) {
        if (primitive._attributeMask & ATTRIB_MASK[attrib]) {
          gl.enableVertexAttribArray(ATTRIB[attrib]);
        } else {
          gl.disableVertexAttribArray(ATTRIB[attrib]);
        }
      }
    }

    // Bind the primitive attributes and indices.
    for (let attributeBuffer of primitive._attributeBuffers) {
      gl.bindBuffer(gl.ARRAY_BUFFER, attributeBuffer._buffer._buffer);
      for (let attrib of attributeBuffer._attributes) {
        gl.vertexAttribPointer(
          attrib._attrib_index,
          attrib._componentCount,
          attrib._componentType,
          attrib._normalized,
          attrib._stride,
          attrib._byteOffset
        );
      }
    }

    if (primitive._indexBuffer) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, primitive._indexBuffer._buffer);
    } else {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }
  }

  _bindMaterialState(material, prevMaterial = null) {
    let gl = this._gl;

    let state = material._state;
    let prevState = prevMaterial ? prevMaterial._state : ~state;

    // Return early if both materials use identical state
    if (state == prevState) {
      return;
    }

    // Any caps bits changed?
    if (material._capsDiff(prevState)) {
      setCap(gl, gl.CULL_FACE, CAP.CULL_FACE, prevState, state);
      setCap(gl, gl.BLEND, CAP.BLEND, prevState, state);
      setCap(gl, gl.DEPTH_TEST, CAP.DEPTH_TEST, prevState, state);
      setCap(gl, gl.STENCIL_TEST, CAP.STENCIL_TEST, prevState, state);

      let colorMaskChange =
        (state & CAP.COLOR_MASK) - (prevState & CAP.COLOR_MASK);
      if (colorMaskChange) {
        let mask = colorMaskChange > 1;
        this._colorMaskNeedsReset = !mask;
        gl.colorMask(mask, mask, mask, mask);
      }

      let depthMaskChange =
        (state & CAP.DEPTH_MASK) - (prevState & CAP.DEPTH_MASK);
      if (depthMaskChange) {
        this._depthMaskNeedsReset = !(depthMaskChange > 1);
        gl.depthMask(depthMaskChange > 1);
      }

      let stencilMaskChange =
        (state & CAP.STENCIL_MASK) - (prevState & CAP.STENCIL_MASK);
      if (stencilMaskChange) {
        gl.stencilMask(stencilMaskChange > 1);
      }
    }

    // Blending enabled and blend func changed?
    if (material._blendDiff(prevState)) {
      gl.blendFunc(material.blendFuncSrc, material.blendFuncDst);
    }

    // Depth testing enabled and depth func changed?
    // if (material._depthFuncDiff(prevState)) {
    //   gl.depthFunc(material.depthFunc);
    // }
  }
}
