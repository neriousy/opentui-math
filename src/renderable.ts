import {
  parseColor,
  RGBA,
  Renderable,
  TextAttributes,
  type ColorInput,
  type OptimizedBuffer,
  type RenderableOptions,
  type RenderContext,
} from "@opentui/core"
import { MeasureMode } from "@opentui/core/yoga"
import { renderLatex } from "./render.js"
import type { MathLayout, RenderLatexOptions } from "./types.js"

const TRANSPARENT = RGBA.fromValues(0, 0, 0, 0)
const MAX_SOURCE_FALLBACK_PREVIEW = 2_000

export interface LatexRenderableOptions extends RenderableOptions<LatexRenderable>, RenderLatexOptions {
  content?: string
  foregroundColor?: ColorInput
  backgroundColor?: ColorInput
  errorColor?: ColorInput
  fallback?: "source" | "message" | "throw"
}

export class LatexRenderable extends Renderable {
  private _content: string
  private _foregroundColor: RGBA
  private _backgroundColor: RGBA
  private _errorColor: RGBA
  private _fallback: "source" | "message" | "throw"
  private parseOptions: RenderLatexOptions
  private layout: MathLayout
  private renderError: Error | undefined

  constructor(ctx: RenderContext, options: LatexRenderableOptions = {}) {
    super(ctx, options)
    this._content = options.content ?? ""
    this._foregroundColor = parseColor(options.foregroundColor ?? "#e8e8f0")
    this._backgroundColor = options.backgroundColor ? parseColor(options.backgroundColor) : TRANSPARENT
    this._errorColor = parseColor(options.errorColor ?? "#ff6b6b")
    this._fallback = options.fallback ?? "message"
    this.parseOptions = extractRenderOptions(options)
    this.layout = this.buildLayout()
    this.setupMeasureFunction()
  }

  public get content(): string {
    return this._content
  }

  public set content(value: string) {
    if (value === this._content) return
    const previousContent = this._content
    const previousError = this.renderError
    this._content = value
    try {
      this.rebuild()
    } catch (error) {
      this._content = previousContent
      this.renderError = previousError
      throw error
    }
  }

  public get foregroundColor(): RGBA {
    return this._foregroundColor
  }

  public set foregroundColor(value: ColorInput) {
    this._foregroundColor = parseColor(value)
    this.requestRender()
  }

  public get backgroundColor(): RGBA {
    return this._backgroundColor
  }

  public set backgroundColor(value: ColorInput) {
    this._backgroundColor = parseColor(value)
    this.requestRender()
  }

  public get errorColor(): RGBA {
    return this._errorColor
  }

  public set errorColor(value: ColorInput) {
    this._errorColor = parseColor(value)
    this.requestRender()
  }

  public get displayMode(): boolean {
    return this.parseOptions.displayMode ?? true
  }

  public set displayMode(value: boolean) {
    if (value === this.displayMode) return
    this.parseOptions = { ...this.parseOptions, displayMode: value }
    this.rebuild()
  }

  public get compactScripts(): boolean {
    return this.parseOptions.compactScripts ?? true
  }

  public set compactScripts(value: boolean) {
    if (value === this.compactScripts) return
    this.parseOptions = { ...this.parseOptions, compactScripts: value }
    this.rebuild()
  }

  public get intrinsicWidth(): number {
    return this.layout.width
  }

  public get intrinsicHeight(): number {
    return this.layout.height
  }

  public get latexError(): Error | undefined {
    return this.renderError
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    if (this.width <= 0 || this.height <= 0) return
    const originX = this.buffered ? 0 : this._screenX
    const originY = this.buffered ? 0 : this._screenY
    const offsetX = Math.max(0, Math.floor((this.width - this.layout.width) / 2))
    const offsetY = Math.max(0, Math.floor((this.height - this.layout.height) / 2))
    const fallbackColor = this.renderError ? this._errorColor : this._foregroundColor
    const drawCell =
      this._backgroundColor.a < 1
        ? buffer.setCellWithAlphaBlending.bind(buffer)
        : buffer.setCell.bind(buffer)

    if (this._backgroundColor.a > 0) {
      buffer.fillRect(originX, originY, this.width, this.height, this._backgroundColor)
    }

    for (let y = 0; y < this.layout.height && y + offsetY < this.height; y++) {
      const row = this.layout.cells[y]
      if (!row) continue
      for (let x = 0; x < this.layout.width && x + offsetX < this.width; x++) {
        const cell = row[x]
        if (!cell) continue
        const foreground = cell.style?.color ? parseColor(cell.style.color) : fallbackColor
        let attributes = TextAttributes.NONE
        if (cell.style?.bold) attributes |= TextAttributes.BOLD
        if (cell.style?.italic) attributes |= TextAttributes.ITALIC
        if (cell.style?.dim) attributes |= TextAttributes.DIM
        drawCell(
          originX + offsetX + x,
          originY + offsetY + y,
          cell.char,
          foreground,
          this._backgroundColor,
          attributes,
        )
      }
    }
  }

  private buildLayout(): MathLayout {
    try {
      this.renderError = undefined
      return renderLatex(this._content, this.parseOptions)
    } catch (error) {
      this.renderError = error instanceof Error ? error : new Error(String(error))
      if (this._fallback === "throw") throw error
      const text =
        this._fallback === "source"
          ? sourcePreview(this._content)
          : `LaTeX error: ${this.renderError.message}`
      return renderLatex(String.raw`\text{${escapeText(text)}}`, { displayMode: false })
    }
  }

  private rebuild(): void {
    this.layout = this.buildLayout()
    this.yogaNode.markDirty()
    this.requestRender()
  }

  private setupMeasureFunction(): void {
    this.yogaNode.setMeasureFunc((width, widthMode, height, heightMode) => ({
      width: constrainedSize(this.layout.width, width, widthMode),
      height: constrainedSize(this.layout.height, height, heightMode),
    }))
  }
}

function constrainedSize(intrinsic: number, available: number, mode: MeasureMode): number {
  if (mode === MeasureMode.Exactly) return Math.max(0, Math.floor(available))
  if (mode === MeasureMode.AtMost) return Math.max(0, Math.min(intrinsic, Math.floor(available)))
  return intrinsic
}

function extractRenderOptions(options: LatexRenderableOptions): RenderLatexOptions {
  return {
    ...(options.displayMode !== undefined ? { displayMode: options.displayMode } : {}),
    ...(options.compactScripts !== undefined ? { compactScripts: options.compactScripts } : {}),
    ...(options.macros ? { macros: options.macros } : {}),
    ...(options.maxExpand !== undefined ? { maxExpand: options.maxExpand } : {}),
    ...(options.strict !== undefined ? { strict: options.strict } : {}),
    ...(options.color ? { color: options.color } : {}),
  }
}

function escapeText(value: string): string {
  return value
    .replace(/\r\n?|\n/g, " ")
    .replace(/[{}%#$&_\\]/g, (char) => `\\${char}`)
}

function sourcePreview(value: string): string {
  if (value.length <= MAX_SOURCE_FALLBACK_PREVIEW) return value
  return `${value.slice(0, MAX_SOURCE_FALLBACK_PREVIEW)}…`
}
