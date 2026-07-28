import {
  parseColor,
  type ColorInput,
  type OptimizedBuffer,
  type RGBA,
  type RenderContext,
} from "@opentui/core"
import { MeasureMode } from "@opentui/core/yoga"
import { LatexRenderable, type LatexRenderableOptions } from "../renderable.js"
import { encodeKittyDelete, encodeKittyPlacement, encodeKittyPng } from "./kitty.js"
import { renderLatexToPng, type RenderedMathImage } from "./render.js"

type GraphicsMode = "auto" | "kitty" | "cells"
const DEFAULT_CELL_WIDTH = 8
const DEFAULT_CELL_HEIGHT = 16

interface GraphicsContext extends RenderContext {
  width: number
  height: number
  frameId: number
  capabilities: {
    kitty_graphics: boolean
    multiplexer?: string
    terminal?: {
      name?: string
    }
  } | null
  resolution?: {
    width: number
    height: number
  } | null
  on(event: string, listener: (...args: any[]) => void): this
  off(event: string, listener: (...args: any[]) => void): this
  writeTerminal?(data: string): boolean
  writeOut?(data: string): boolean
}

export interface GraphicalLatexRenderableOptions extends LatexRenderableOptions {
  graphicsMode?: GraphicsMode
  fontSize?: number
  pixelRatio?: number
  maxRasterWidth?: number
  maxRasterHeight?: number
  maxRasterPixels?: number
  graphicsForegroundColor?: string
  graphicsZIndex?: number
}

/**
 * A high-resolution LaTeX renderable. On Kitty-graphics terminals it overlays
 * an antialiased MathJax image; elsewhere it behaves exactly like
 * `LatexRenderable`.
 */
export class GraphicalLatexRenderable extends LatexRenderable {
  private readonly graphicsContext: GraphicsContext
  private readonly imageId: number
  private readonly graphicsMode: GraphicsMode
  private readonly fontSize: number
  private readonly pixelRatio: number
  private readonly graphicsZIndex: number
  private readonly graphicsParseOptions: Pick<
    GraphicalLatexRenderableOptions,
    "macros" | "maxExpand" | "maxSourceLength" | "maxExpandedLength" | "maxDepth"
  >
  private readonly rasterLimitOptions: Pick<
    GraphicalLatexRenderableOptions,
    "maxRasterWidth" | "maxRasterHeight" | "maxRasterPixels"
  >
  private graphicsColorFollowsForeground: boolean
  private graphicsColor: string
  private image: RenderedMathImage | undefined
  private imageColumns = 0
  private imageRows = 0
  private imageRevision = 0
  private uploadedRevision = -1
  private rasterRevision = 0
  private lastRenderedFrame = -1
  private lastPlacement = ""
  private placed = false
  private renderFailure: Error | undefined
  private pendingRaster: Promise<void> = Promise.resolve()

  constructor(ctx: RenderContext, options: GraphicalLatexRenderableOptions = {}) {
    super(ctx, options)
    this.graphicsContext = ctx as GraphicsContext
    this.imageId = makeImageId(this.num)
    this.graphicsMode = options.graphicsMode ?? "auto"
    this.fontSize = positiveNumber(options.fontSize, 32)
    this.pixelRatio = positiveNumber(options.pixelRatio, 1)
    this.graphicsZIndex = Math.floor(options.graphicsZIndex ?? 1)
    this.graphicsParseOptions = {
      ...(options.macros ? { macros: options.macros } : {}),
      ...(options.maxExpand !== undefined ? { maxExpand: options.maxExpand } : {}),
      ...(options.maxSourceLength !== undefined ? { maxSourceLength: options.maxSourceLength } : {}),
      ...(options.maxExpandedLength !== undefined
        ? { maxExpandedLength: options.maxExpandedLength }
        : {}),
      ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
    }
    this.rasterLimitOptions = {
      ...(options.maxRasterWidth !== undefined ? { maxRasterWidth: options.maxRasterWidth } : {}),
      ...(options.maxRasterHeight !== undefined ? { maxRasterHeight: options.maxRasterHeight } : {}),
      ...(options.maxRasterPixels !== undefined ? { maxRasterPixels: options.maxRasterPixels } : {}),
    }
    this.graphicsColorFollowsForeground = options.graphicsForegroundColor === undefined
    this.graphicsColor = options.graphicsForegroundColor ?? colorToCss(super.foregroundColor)

    this.setupGraphicsMeasureFunction()
    this.graphicsContext.on("frame", this.handleFrame)
    this.graphicsContext.on("resize", this.handleResize)
    this.graphicsContext.on("capabilities", this.handleCapabilities)
    this.scheduleRaster()
  }

  public override get content(): string {
    return super.content
  }

  public override set content(value: string) {
    if (value === super.content) return
    super.content = value
    this.scheduleRaster()
  }

  public override get foregroundColor(): RGBA {
    return super.foregroundColor
  }

  public override set foregroundColor(value: ColorInput) {
    super.foregroundColor = value
    if (this.graphicsColorFollowsForeground) {
      this.graphicsColor = colorToCss(super.foregroundColor)
      this.scheduleRaster()
    }
  }

  public get graphicsForegroundColor(): string {
    return this.graphicsColor
  }

  public set graphicsForegroundColor(value: string | undefined) {
    const followsForeground = value === undefined
    const nextColor = value ?? colorToCss(super.foregroundColor)
    if (
      followsForeground === this.graphicsColorFollowsForeground &&
      nextColor === this.graphicsColor
    ) {
      return
    }
    this.graphicsColorFollowsForeground = followsForeground
    this.graphicsColor = nextColor
    this.scheduleRaster()
  }

  public override get displayMode(): boolean {
    return super.displayMode
  }

  public override set displayMode(value: boolean) {
    if (value === super.displayMode) return
    super.displayMode = value
    this.scheduleRaster()
  }

  public get isUsingGraphics(): boolean {
    return this.canUseGraphics() && Boolean(this.image) && !this.latexError && !this.renderFailure
  }

  public get graphicsError(): Error | undefined {
    return this.renderFailure
  }

  public async whenGraphicsReady(): Promise<boolean> {
    while (!this.isDestroyed) {
      const pending = this.pendingRaster
      await pending
      if (pending === this.pendingRaster) return this.isUsingGraphics
    }
    return false
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    if (!this.isUsingGraphics) {
      super.renderSelf(buffer)
      return
    }
    if (this.width <= 0 || this.height <= 0) {
      this.lastRenderedFrame = -1
      return
    }

    const graphicsBackground = super.backgroundColor
    if (graphicsBackground.a > 0 && this.width > 0 && this.height > 0) {
      const originX = this.buffered ? 0 : this.screenX
      const originY = this.buffered ? 0 : this.screenY
      buffer.fillRect(originX, originY, this.width, this.height, graphicsBackground)
    }
    this.lastRenderedFrame = this.graphicsContext.frameId
  }

  protected override destroySelf(): void {
    this.graphicsContext.off("frame", this.handleFrame)
    this.graphicsContext.off("resize", this.handleResize)
    this.graphicsContext.off("capabilities", this.handleCapabilities)
    this.removePlacement()
    super.destroySelf()
  }

  private readonly handleFrame = (): void => {
    if (!this.isUsingGraphics || this.lastRenderedFrame !== this.graphicsContext.frameId) {
      this.removePlacement()
      return
    }

    const write = this.getTerminalWriter()
    const image = this.image
    if (!write || !image) return

    if (this.uploadedRevision !== this.imageRevision) {
      write(encodeKittyPng(image.png, this.imageId))
      this.uploadedRevision = this.imageRevision
      this.lastPlacement = ""
    }

    const { columns, rows } = this.placementCellSize(image)
    const column = Math.max(1, this.screenX + 1 + Math.floor((this.width - columns) / 2))
    const row = Math.max(1, this.screenY + 1 + Math.floor((this.height - rows) / 2))
    const placementKey = `${column}:${row}:${columns}:${rows}:${this.graphicsZIndex}:${this.imageRevision}`

    if (placementKey !== this.lastPlacement) {
      write(
        encodeKittyPlacement({
          imageId: this.imageId,
          column,
          row,
          columns,
          rows,
          zIndex: this.graphicsZIndex,
        }),
      )
      this.lastPlacement = placementKey
      this.placed = true
    }
  }

  private readonly handleResize = (): void => {
    this.updateImageCellSize()
    this.lastPlacement = ""
    this.requestRender()
  }

  private readonly handleCapabilities = (): void => {
    if (this.canUseGraphics()) this.scheduleRaster()
    else this.removePlacement()
    this.yogaNode.markDirty()
    this.requestRender()
  }

  private scheduleRaster(): void {
    const revision = ++this.rasterRevision
    this.renderFailure = undefined
    if (!this.canUseGraphics() || this.latexError) {
      if (this.latexError) this.removePlacement()
      this.pendingRaster = Promise.resolve()
      return
    }

    this.pendingRaster = renderLatexToPng(this.content, {
      displayMode: this.displayMode,
      foregroundColor: this.graphicsColor,
      fontSize: this.fontSize,
      pixelRatio: this.pixelRatio,
      ...this.graphicsParseOptions,
      ...this.rasterLimitOptions,
    })
      .then((image) => {
        if (revision !== this.rasterRevision || this.isDestroyed) return
        this.image = image
        this.imageRevision++
        this.uploadedRevision = -1
        this.updateImageCellSize()
        this.yogaNode.markDirty()
        this.requestRender()
      })
      .catch((error) => {
        if (revision !== this.rasterRevision || this.isDestroyed) return
        this.renderFailure = error instanceof Error ? error : new Error(String(error))
        this.image = undefined
        this.removePlacement()
        this.yogaNode.markDirty()
        this.requestRender()
      })
  }

  private updateImageCellSize(): void {
    if (!this.image) return
    this.imageColumns = Math.max(
      1,
      Math.ceil(this.image.width / (DEFAULT_CELL_WIDTH * this.pixelRatio)),
    )
    this.imageRows = Math.max(
      1,
      Math.ceil(this.image.height / (DEFAULT_CELL_HEIGHT * this.pixelRatio)),
    )
  }

  private cellPixelSize(): { width: number; height: number } {
    const resolution = this.graphicsContext.resolution
    if (resolution && this.graphicsContext.width > 0 && this.graphicsContext.height > 0) {
      return {
        width: resolution.width / this.graphicsContext.width,
        height: resolution.height / this.graphicsContext.height,
      }
    }
    return { width: DEFAULT_CELL_WIDTH, height: DEFAULT_CELL_HEIGHT }
  }

  private placementCellSize(image: RenderedMathImage): { columns: number; rows: number } {
    const cell = this.cellPixelSize()
    return fitImageToCells(
      image.width,
      image.height,
      cell.width,
      cell.height,
      Math.min(this.width, this.imageColumns),
      Math.min(this.height, this.imageRows),
      true,
    )
  }

  private canUseGraphics(): boolean {
    if (this.graphicsMode === "cells") return false
    const hasWriter = Boolean(this.getTerminalWriter())
    if (this.graphicsMode === "kitty") return hasWriter
    const capabilities = this.graphicsContext.capabilities
    const terminalName = capabilities?.terminal?.name ?? ""
    return Boolean(
      hasWriter &&
        (capabilities?.kitty_graphics || knownKittyGraphicsTerminal(terminalName, process.env)) &&
        (!capabilities?.multiplexer || capabilities.multiplexer === "none"),
    )
  }

  private getTerminalWriter(): ((data: string) => boolean) | undefined {
    const context = this.graphicsContext
    if (typeof context.writeTerminal === "function") return context.writeTerminal.bind(context)
    // OpenTUI 0.4 detects Kitty graphics but has not exposed a public raw-output
    // method yet. Keep this compatibility bridge isolated so it can disappear
    // as soon as `writeTerminal` is released.
    if (typeof context.writeOut === "function") return context.writeOut.bind(context)
    return undefined
  }

  private removePlacement(): void {
    if (!this.placed) return
    this.getTerminalWriter()?.(encodeKittyDelete(this.imageId))
    this.placed = false
    this.lastPlacement = ""
    this.uploadedRevision = -1
  }

  private setupGraphicsMeasureFunction(): void {
    this.yogaNode.setMeasureFunc((width, widthMode, height, heightMode) => {
      const intrinsicWidth = this.isUsingGraphics ? this.imageColumns : this.intrinsicWidth
      const intrinsicHeight = this.isUsingGraphics ? this.imageRows : this.intrinsicHeight
      return {
        width: constrainedSize(intrinsicWidth, width, widthMode),
        height: constrainedSize(intrinsicHeight, height, heightMode),
      }
    })
  }
}

export function fitImageToCells(
  imageWidth: number,
  imageHeight: number,
  cellWidth: number,
  cellHeight: number,
  availableColumns: number,
  availableRows: number,
  allowUpscale = false,
): { columns: number; rows: number } {
  const maxColumns = Math.max(1, Math.floor(availableColumns))
  const maxRows = Math.max(1, Math.floor(availableRows))
  const safeCellWidth = positiveNumber(cellWidth, 8)
  const safeCellHeight = positiveNumber(cellHeight, 16)
  const safeImageWidth = positiveNumber(imageWidth, safeCellWidth)
  const safeImageHeight = positiveNumber(imageHeight, safeCellHeight)
  const maxPixelWidth = maxColumns * safeCellWidth
  const maxPixelHeight = maxRows * safeCellHeight
  const scale = Math.min(
    allowUpscale ? Number.POSITIVE_INFINITY : 1,
    maxPixelWidth / safeImageWidth,
    maxPixelHeight / safeImageHeight,
  )

  return {
    columns: Math.max(1, Math.min(maxColumns, Math.ceil((safeImageWidth * scale) / safeCellWidth))),
    rows: Math.max(1, Math.min(maxRows, Math.ceil((safeImageHeight * scale) / safeCellHeight))),
  }
}

export function knownKittyGraphicsTerminal(
  detectedTerminalName: string,
  environment: Record<string, string | undefined>,
): boolean {
  if (environment.TMUX || environment.ZELLIJ || environment.STY) return false
  const signature = [
    detectedTerminalName,
    environment.TERM_PROGRAM,
    environment.TERM,
    environment.GHOSTTY_RESOURCES_DIR ? "ghostty" : "",
    environment.KITTY_WINDOW_ID ? "kitty" : "",
    environment.WEZTERM_PANE ? "wezterm" : "",
  ]
    .join(" ")
    .toLowerCase()
  return /\b(?:ghostty|kitty|wezterm)\b/.test(signature)
}

function constrainedSize(intrinsic: number, available: number, mode: MeasureMode): number {
  if (mode === MeasureMode.Exactly) return Math.max(0, Math.floor(available))
  if (mode === MeasureMode.AtMost) return Math.max(0, Math.min(intrinsic, Math.floor(available)))
  return intrinsic
}

function makeImageId(renderableNumber: number): number {
  const processPart = (process.pid & 0x7fff) << 16
  return (processPart | (renderableNumber & 0xffff)) || 1
}

function colorToCss(color: ReturnType<typeof parseColor>): string {
  const [r, g, b, a] = color.toInts()
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? value! : fallback
}
