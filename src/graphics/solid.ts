import { extend } from "@opentui/solid/components"
import { GraphicalLatexRenderable } from "./renderable.js"

declare module "@opentui/solid" {
  interface OpenTUIComponents {
    latexImage: typeof GraphicalLatexRenderable
  }
}

export function registerGraphicalLatex(): void {
  extend({ latexImage: GraphicalLatexRenderable })
}

export * from "./index.js"
