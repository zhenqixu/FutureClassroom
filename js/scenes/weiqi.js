import * as cg from "../render/core/cg.js";
import { controllerMatrix, buttonState, joyStickState } from "../render/core/controllerInput.js";

export const init = async model => {
   let board = model.add('cube').move(0, -0.9, 0).texture('media/textures/board2.png')
   model.setTable(false);

    model.animate(() => {

    });
}