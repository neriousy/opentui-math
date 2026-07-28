import { initializeMathGraphics } from "./render.js"

// MathJax's packaged Node loader must initialize before OpenTUI installs its
// terminal runtime hooks. Importing `opentui-math/graphics` guarantees the
// correct ordering without requiring application code to remember a preload.
await initializeMathGraphics()

export { initializeMathGraphics, renderLatexToPng, renderLatexToSvg } from "./render.js"
export {
  completeLatexPrefix,
  LatexStreamController,
  type LatexStreamOptions,
  type LatexStreamResult,
  type LatexStreamTarget,
} from "../stream.js"
export { GraphicalLatexRenderable } from "./renderable.js"
export { encodeKittyDelete, encodeKittyPlacement, encodeKittyPng } from "./kitty.js"
export type { PngMathOptions, RenderedMathImage, SvgMathOptions } from "./render.js"
export type { GraphicalLatexRenderableOptions } from "./renderable.js"
export type { KittyPlacement } from "./kitty.js"
