import { Resvg } from "@resvg/resvg-js"
import {
  assertNestingDepth,
  assertSourceLength,
  DEFAULT_MAX_NESTING_DEPTH,
  DEFAULT_MAX_SOURCE_LENGTH,
  resolvePositiveInteger,
} from "../limits.js"
import { expandLatexMacros } from "../parser.js"
import type { ParseOptions } from "../types.js"

export interface SvgMathOptions
  extends Pick<
    ParseOptions,
    "macros" | "maxExpand" | "maxSourceLength" | "maxExpandedLength" | "maxDepth"
  > {
  displayMode?: boolean
  foregroundColor?: string
}

export interface PngMathOptions extends SvgMathOptions {
  fontSize?: number
  pixelRatio?: number
  backgroundColor?: string
  maxRasterWidth?: number
  maxRasterHeight?: number
  maxRasterPixels?: number
}

export interface RenderedMathImage {
  png: Uint8Array
  svg: string
  width: number
  height: number
}

interface MathJaxApi {
  tex2svgPromise(
    source: string,
    options: {
      display: boolean
      em: number
      ex: number
      containerWidth: number
    },
  ): Promise<unknown>
  startup: {
    adaptor: {
      serializeXML(node: unknown): string
      tags(node: unknown, name: string): unknown[]
    }
  }
}

let mathJaxPromise: Promise<MathJaxApi> | undefined

/**
 * Load the MathJax graphics engine before OpenTUI takes control of the terminal.
 * The public graphics entry point does this automatically.
 */
export async function initializeMathGraphics(): Promise<void> {
  await getMathJax()
}

/**
 * Render TeX to a self-contained SVG whose glyphs are real New Computer Modern
 * paths. The first call loads MathJax; later calls reuse the initialized engine.
 */
export async function renderLatexToSvg(source: string, options: SvgMathOptions = {}): Promise<string> {
  const maxSourceLength = resolvePositiveInteger(
    options.maxSourceLength,
    DEFAULT_MAX_SOURCE_LENGTH,
    "maxSourceLength",
  )
  const maxDepth = resolvePositiveInteger(options.maxDepth, DEFAULT_MAX_NESTING_DEPTH, "maxDepth")
  assertSourceLength(source, maxSourceLength)
  assertNestingDepth(source, maxDepth)
  const expandedSource = expandLatexMacros(source, options)
  const mathJax = await getMathJax()
  const container = await mathJax.tex2svgPromise(expandedSource, {
    display: options.displayMode ?? true,
    em: 16,
    ex: 8,
    containerWidth: 80 * 16,
  })
  const svgNode = mathJax.startup.adaptor.tags(container, "svg")[0]
  if (!svgNode) throw new Error("MathJax did not produce an SVG")

  const svg = mathJax.startup.adaptor.serializeXML(svgNode)
  return applySvgColor(svg, options.foregroundColor ?? "#e8e8f0")
}

/**
 * Render TeX to a transparent, antialiased PNG suitable for Kitty-compatible
 * terminal graphics. `fontSize` is expressed in CSS pixels.
 */
export async function renderLatexToPng(source: string, options: PngMathOptions = {}): Promise<RenderedMathImage> {
  const fontSize = positiveNumber(options.fontSize, 32)
  const pixelRatio = positiveNumber(options.pixelRatio, 1)
  const maxRasterWidth = resolvePositiveInteger(options.maxRasterWidth, 8192, "maxRasterWidth")
  const maxRasterHeight = resolvePositiveInteger(options.maxRasterHeight, 8192, "maxRasterHeight")
  const maxRasterPixels = resolvePositiveInteger(
    options.maxRasterPixels,
    16_777_216,
    "maxRasterPixels",
  )
  const svg = await renderLatexToSvg(source, options)
  const createRenderer = (zoom: number) =>
    new Resvg(svg, {
      fitTo: { mode: "zoom", value: zoom },
      font: {
        defaultFontSize: fontSize,
        loadSystemFonts: false,
      },
      shapeRendering: 2,
      textRendering: 2,
      ...(options.backgroundColor ? { background: options.backgroundColor } : {}),
    })
  let renderer = createRenderer(pixelRatio)
  const dimensionScale = Math.min(
    1,
    maxRasterWidth / Math.max(1, renderer.width),
    maxRasterHeight / Math.max(1, renderer.height),
    Math.sqrt(maxRasterPixels / Math.max(1, renderer.width * renderer.height)),
  )
  if (dimensionScale < 1) {
    if (renderer.width * dimensionScale < 1 || renderer.height * dimensionScale < 1) {
      throw new RangeError(
        "LaTeX image aspect ratio is too extreme for the configured raster limits",
      )
    }
    renderer = createRenderer(pixelRatio * dimensionScale)
  }
  const image = renderer.render()

  return {
    png: image.asPng(),
    svg,
    width: image.width,
    height: image.height,
  }
}

async function getMathJax(): Promise<MathJaxApi> {
  mathJaxPromise ??= prepareMathJaxGlobal().then(() => import("mathjax")).then(async ({ default: MathJax }) => {
    const api = await MathJax.init({
      loader: { load: ["input/tex", "output/svg"] },
      svg: { fontCache: "local" },
    })
    if (!api) throw new Error("MathJax failed to initialize")
    return api as MathJaxApi
  })
  return mathJaxPromise
}

async function prepareMathJaxGlobal(): Promise<void> {
  // OpenTUI installs a minimal `global.window` for requestAnimationFrame.
  // MathJax treats any window-like value as the browser global, while its
  // Node setup writes configuration to `globalThis.MathJax`. Point both names
  // at the same object so lazy graphics imports work after renderer startup.
  const scope = globalThis as typeof globalThis & {
    MathJax?: Record<string, unknown>
    window?: { MathJax?: Record<string, unknown> }
  }
  if (!scope.window) return
  scope.MathJax ??= scope.window.MathJax ?? {}
  const descriptor = Object.getOwnPropertyDescriptor(scope.window, "MathJax")
  if (!descriptor || descriptor.configurable) {
    Object.defineProperty(scope.window, "MathJax", {
      configurable: true,
      enumerable: true,
      get: () => scope.MathJax,
      set: (value: Record<string, unknown>) => {
        scope.MathJax = value
      },
    })
  } else {
    scope.MathJax = scope.window.MathJax ?? scope.MathJax
  }
}

function applySvgColor(svg: string, color: string): string {
  const safeColor = color.replace(/[<>"']/g, "")
  return svg.replace("<svg ", `<svg color="${safeColor}" `)
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? value! : fallback
}
