declare module "@opentui/core" {
  export type ColorInput = string | RGBA

  export class RGBA {
    readonly a: number
    static fromValues(r: number, g: number, b: number, a: number): RGBA
    toInts(): [number, number, number, number]
  }

  export interface OptimizedBuffer {
    fillRect(x: number, y: number, width: number, height: number, color: RGBA): void
    setCell(x: number, y: number, char: string, foreground: RGBA, background: RGBA, attributes?: number): void
    setCellWithAlphaBlending(
      x: number,
      y: number,
      char: string,
      foreground: RGBA,
      background: RGBA,
      attributes?: number,
    ): void
  }

  export interface YogaNode {
    markDirty(): void
    setMeasureFunc(
      measure: (width: number, widthMode: number, height: number, heightMode: number) => {
        width: number
        height: number
      },
    ): void
  }

  export interface RenderContext {
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
    on(event: string, listener: (...args: any[]) => void): this
    off(event: string, listener: (...args: any[]) => void): this
    root: {
      add(renderable: Renderable): number
    }
    destroy(): void
  }

  export interface CliRenderer extends RenderContext {}

  export interface RenderableOptions<T extends Renderable = Renderable> {
    id?: string
    width?: number | "auto" | `${number}%`
    height?: number | "auto" | `${number}%`
    minWidth?: number | "auto" | `${number}%`
    minHeight?: number | "auto" | `${number}%`
    maxWidth?: number | "auto" | `${number}%`
    maxHeight?: number | "auto" | `${number}%`
    position?: "relative" | "absolute"
    left?: number | "auto" | `${number}%`
    right?: number | "auto" | `${number}%`
    top?: number | "auto" | `${number}%`
    bottom?: number | "auto" | `${number}%`
    flexGrow?: number
    flexShrink?: number
    flexDirection?: "row" | "column"
    flexWrap?: "nowrap" | "wrap" | "wrap-reverse"
    alignItems?: "auto" | "flex-start" | "center" | "flex-end" | "stretch" | "baseline" | "space-between" | "space-around"
    justifyContent?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly"
    padding?: number
    marginTop?: number
    zIndex?: number
    visible?: boolean
    buffered?: boolean
    opacity?: number
    renderBefore?: (this: T, buffer: OptimizedBuffer, deltaTime: number) => void
    renderAfter?: (this: T, buffer: OptimizedBuffer, deltaTime: number) => void
  }

  export class Renderable {
    protected readonly yogaNode: YogaNode
    protected readonly _screenX: number
    protected readonly _screenY: number
    protected readonly buffered: boolean
    readonly width: number
    readonly height: number
    readonly screenX: number
    readonly screenY: number
    readonly num: number
    readonly isDestroyed: boolean
    constructor(context: RenderContext, options: RenderableOptions<any>)
    requestRender(): void
    destroy(): void
    protected renderSelf(buffer: OptimizedBuffer, deltaTime?: number): void
    protected destroySelf(): void
  }

  export class BoxRenderable extends Renderable {
    constructor(context: RenderContext, options?: RenderableOptions & Record<string, unknown>)
    add(renderable: Renderable): number
  }

  export class TextRenderable extends Renderable {
    constructor(
      context: RenderContext,
      options: RenderableOptions & {
        content: string
        fg?: ColorInput
        attributes?: number
      },
    )
  }

  export function createCliRenderer(options?: Record<string, unknown>): Promise<CliRenderer>

  export const TextAttributes: {
    readonly NONE: number
    readonly BOLD: number
    readonly ITALIC: number
    readonly DIM: number
  }

  export function parseColor(value: ColorInput): RGBA
}

declare module "@opentui/core/yoga" {
  export enum MeasureMode {
    Undefined = 0,
    Exactly = 1,
    AtMost = 2,
  }
}

declare module "@opentui/react" {
  import type { Renderable } from "@opentui/core"

  export interface OpenTUIComponents {}
  export function extend(components: Record<string, new (...args: any[]) => Renderable>): void
}

declare module "@opentui/solid" {
  export interface OpenTUIComponents {}
}

declare module "@opentui/solid/components" {
  import type { Renderable } from "@opentui/core"

  export function extend(components: Record<string, new (...args: any[]) => Renderable>): void
}

declare module "@opentui/core/testing" {
  import type { RenderContext, Renderable, RGBA } from "@opentui/core"

  export interface TestRenderer extends RenderContext {
    root: {
      add(renderable: Renderable): number
    }
    destroy(): void
  }

  export interface TestRendererSetup {
    renderer: TestRenderer
    renderOnce(): Promise<void>
    captureCharFrame(): string
    captureSpans(): {
      cols: number
      rows: number
      cursor: [number, number]
      lines: Array<{
        spans: Array<{
          text: string
          fg: RGBA
          bg: RGBA
          attributes: number
          width: number
        }>
      }>
    }
  }

  export function createTestRenderer(options: { width?: number; height?: number }): Promise<TestRendererSetup>
}
