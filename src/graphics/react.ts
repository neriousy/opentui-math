import { extend } from "@opentui/react"
import { GraphicalLatexRenderable } from "./renderable.js"

declare module "@opentui/react" {
  interface OpenTUIComponents {
    latexImage: typeof GraphicalLatexRenderable
  }
}

export function registerGraphicalLatex(): void {
  extend({ latexImage: GraphicalLatexRenderable })
}

export * from "./index.js"
