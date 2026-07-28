import { extend } from "@opentui/react"
import { LatexRenderable } from "./renderable.js"

declare module "@opentui/react" {
  interface OpenTUIComponents {
    latex: typeof LatexRenderable
  }
}

export function registerLatex(): void {
  extend({ latex: LatexRenderable })
}

export * from "./index.js"
