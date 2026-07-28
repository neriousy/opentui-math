import { extend } from "@opentui/solid/components"
import { LatexRenderable } from "./renderable.js"

declare module "@opentui/solid" {
  interface OpenTUIComponents {
    latex: typeof LatexRenderable
  }
}

export function registerLatex(): void {
  extend({ latex: LatexRenderable })
}

export * from "./index.js"
