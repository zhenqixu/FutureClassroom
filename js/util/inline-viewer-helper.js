// Copyright 2019 The Immersive Web Community Group
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

/*
Provides a simple method for tracking which XRReferenceSpace is associated with
which XRSession. Also handles the necessary logic for enabling mouse/touch-based
view rotation for inline sessions if desired.
*/

import { quat } from "../render/math/gl-matrix.js";
import * as keyboardInput from "./input_keyboard.js";

const LOOK_SPEED = 0.0025;
const WALK_SPEED = 0.02;

export class InlineViewerHelper {

  constructor(canvas, referenceSpace) {
    //this.theta = 2 * Math.PI * ((5 * window.playerid) % 8) / 8;
    this.theta = Math.PI;
    this.lookYaw = this.theta;
    this.walkPosition = [-4*Math.sin(this.theta), 0, -4*Math.cos(this.theta)];

    this.lookPitch = 0;
    this.viewerHeight = 0;

    this.canvas = canvas;
    this.baseRefSpace = referenceSpace;
    this.refSpace = referenceSpace;

    this.dirty = false;

    canvas.style.cursor = "grab";

    canvas.addEventListener("mousemove", (event) => {
      // Only rotate when the left button is pressed
      if (event.buttons & 1) {
        if(window.interactMode == 0) this.rotateView(event.movementX, event.movementY);
      }
      if (window.webrtc_start != undefined) {
        window.webrtc_start();
      }
    });

    // Keep track of touch-related state so that users can touch and drag on
    // the canvas to adjust the viewer pose in an inline session.
    let primaryTouch = undefined;
    let prevTouchX = undefined;
    let prevTouchY = undefined;

    document.addEventListener("keydown", (event) => {
      this.onKeyDown(event);
    });

    document.addEventListener("keyup", (event) => {
      this.onKeyUp(event);
    });

    canvas.addEventListener("touchstart", (event) => {
      if (primaryTouch == undefined) {
        let touch = event.changedTouches[0];
        primaryTouch = touch.identifier;
        prevTouchX = touch.pageX;
        prevTouchY = touch.pageY;
      }
    });

    canvas.addEventListener("touchend", (event) => {
      for (let touch of event.changedTouches) {
        if (primaryTouch == touch.identifier) {
          primaryTouch = undefined;
          if(window.interactMode == 0) this.rotateView(touch.pageX - prevTouchX, touch.pageY - prevTouchY);
        }
      }
    });

    canvas.addEventListener("touchcancel", (event) => {
      for (let touch of event.changedTouches) {
        if (primaryTouch == touch.identifier) {
          primaryTouch = undefined;
        }
      }
    });

    canvas.addEventListener("touchmove", (event) => {
      for (let touch of event.changedTouches) {
        if (primaryTouch == touch.identifier && window.interactMode == 0) {
          this.rotateView(touch.pageX - prevTouchX, touch.pageY - prevTouchY);
          prevTouchX = touch.pageX;
          prevTouchY = touch.pageY;
        }
      }
    });
  }

  setHeight(value) {
    if (this.viewerHeight != value) {
      this.viewerHeight = value;
    }
    this.dirty = true;
  }

  rotateView(dx, dy) {
    this.lookYaw += dx * LOOK_SPEED;
    this.lookPitch += dy * LOOK_SPEED;
    if (this.lookPitch < -Math.PI * 0.5) {
      this.lookPitch = -Math.PI * 0.5;
    }
    if (this.lookPitch > Math.PI * 0.5) {
      this.lookPitch = Math.PI * 0.5;
    }
    this.dirty = true;
  }

  onKeyDown(e) {

  }

  update() {

    if(interactMode == 0) {
      if (keyboardInput.keyIsDown(keyboardInput.KEY_A)) {
        // console.log("strafe left");
        this.walkPosition[2] += WALK_SPEED * Math.cos(this.lookYaw + 0.5 * Math.PI);
        this.walkPosition[0] += WALK_SPEED * Math.sin(this.lookYaw + 0.5 * Math.PI);
      }
      if (keyboardInput.keyIsDown(keyboardInput.KEY_D)) {
        // console.log("strafe right");
        this.walkPosition[2] -= WALK_SPEED * Math.cos(this.lookYaw + 0.5 * Math.PI);
        this.walkPosition[0] -= WALK_SPEED * Math.sin(this.lookYaw + 0.5 * Math.PI);
      }
      if (keyboardInput.keyIsDown(keyboardInput.KEY_W)) {
        // console.log("move forward");
        this.walkPosition[2] += WALK_SPEED * Math.cos(this.lookYaw);
        this.walkPosition[0] += WALK_SPEED * Math.sin(this.lookYaw);
      }
      if (keyboardInput.keyIsDown(keyboardInput.KEY_S)) {
        // console.log("move back");
        this.walkPosition[2] -= WALK_SPEED * Math.cos(this.lookYaw);
        this.walkPosition[0] -= WALK_SPEED * Math.sin(this.lookYaw);
      }
      if (keyboardInput.keyIsDown(keyboardInput.KEY_DOWN)) {
        // console.log("move forward");
        this.walkPosition[1] += WALK_SPEED;
      }
      if (keyboardInput.keyIsDown(keyboardInput.KEY_UP)) {
        // console.log("move back");
        this.walkPosition[1] -= WALK_SPEED;
      }
      if (keyboardInput.keyIsDown(keyboardInput.KEY_LEFT)) {
        // console.log("turn left");
        this.lookYaw += WALK_SPEED;
      }
      if (keyboardInput.keyIsDown(keyboardInput.KEY_RIGHT)) {
        // console.log("turn right");
        this.lookYaw -= WALK_SPEED;
      }
      this.dirty = true;
    }
  }

  onKeyUp(e) {
    console.log('keyCode = ', e.keyCode);
    switch (e.keyCode) {
      case keyboardInput.KEY_TAB:
        window.isMirrored = !window.isMirrored;
        break;
      case keyboardInput.KEY_ESC:
        window.isHeader = !window.isHeader;
        header.style.position = 'absolute';
        header.style.left = window.isHeader ? '8px' : '-1000px';
        break;
      case keyboardInput.KEY_BACKQUOTE:
        window.isWhitescreen = ! window.isWhitescreen;
        break;
      case keyboardInput.KEY_Z:
        window.isSlideShow = !window.isSlideShow;
        break;
      case keyboardInput.KEY_SPACE:
        window.interactMode = 1 - window.interactMode;
        break;
    }
    this.dirty = true;
  }

  reset() {
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.refSpace = this.baseRefSpace;
    this.dirty = false;
  }

  // XRReferenceSpace offset is immutable, so return a new reference space
  // that has an updated orientation.
  get referenceSpace() {
    if (this.dirty) {
      // Represent the rotational component of the reference space as a
      // quaternion.
      let invOrient = quat.create();
      quat.rotateX(invOrient, invOrient, -this.lookPitch);
      quat.rotateY(invOrient, invOrient, -this.lookYaw);
      let xform = new XRRigidTransform(
        {},
        { x: invOrient[0], y: invOrient[1], z: invOrient[2], w: invOrient[3] }
      );
      this.refSpace = this.baseRefSpace.getOffsetReferenceSpace(xform);
      xform = new XRRigidTransform({ y: -this.viewerHeight });
      this.refSpace = this.refSpace.getOffsetReferenceSpace(xform);
      xform = new XRRigidTransform({ x: this.walkPosition[0], y: this.walkPosition[1], z: this.walkPosition[2], w: 1 });
      this.refSpace = this.refSpace.getOffsetReferenceSpace(xform);
      this.dirty = false;
    }
    return this.refSpace;
  }
}
