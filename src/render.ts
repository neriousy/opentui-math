import { layoutMath } from "./layout.js"
import { parseLatex } from "./parser.js"
import type { MathLayout, RenderLatexOptions } from "./types.js"

export function renderLatex(source: string, options: RenderLatexOptions = {}): MathLayout {
  return layoutMath(parseLatex(source, options), options)
}

export function renderLatexToString(source: string, options: RenderLatexOptions = {}): string {
  return renderLatex(source, options).toString()
}
