import { describe, expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { encodeKittyDelete, encodeKittyPlacement, encodeKittyPng } from "../src/graphics/kitty.js"
import { renderLatexToPng, renderLatexToSvg } from "../src/graphics/render.js"
import {
  fitImageToCells,
  GraphicalLatexRenderable,
  knownKittyGraphicsTerminal,
} from "../src/graphics/renderable.js"

describe("high-resolution graphics", () => {
  test("renders self-contained Computer Modern SVG paths", async () => {
    const svg = await renderLatexToSvg(String.raw`\frac{x\sqrt{3}}{(x-3)^2}`, {
      foregroundColor: "#111111",
    })

    expect(svg).toContain("<svg ")
    expect(svg).toContain("<path ")
    expect(svg).toContain('color="#111111"')
    expect(svg).not.toContain("<mjx-container")
  })

  test("expands the same simple user macros as the cell renderer", async () => {
    const withMacro = await renderLatexToSvg(String.raw`\R`, {
      macros: { R: String.raw`\mathbb{R}` },
    })
    expect(withMacro).toContain(String.raw`data-latex="\mathbb{R}"`)
    expect(withMacro).toContain("NCM-DS-211D")
  })

  test("renders a transparent antialiased PNG", async () => {
    const image = await renderLatexToPng(String.raw`\frac{x\sqrt{3}}{(x-3)^2}`, {
      foregroundColor: "#111111",
      fontSize: 36,
    })

    expect([...image.png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(image.width).toBeGreaterThan(100)
    expect(image.height).toBeGreaterThan(50)
  })

  test("scales oversized rasters within configured allocation limits", async () => {
    const row = Array.from({ length: 12 }, (_, index) => String(index + 1)).join("&")
    const matrix = String.raw`\begin{bmatrix}${Array.from({ length: 12 }, () => row).join(String.raw`\\`)}\end{bmatrix}`
    const image = await renderLatexToPng(matrix, {
      fontSize: 32,
      maxRasterWidth: 128,
      maxRasterHeight: 128,
      maxRasterPixels: 16_384,
    })
    expect(image.width).toBeLessThanOrEqual(128)
    expect(image.height).toBeLessThanOrEqual(128)
    expect(image.width * image.height).toBeLessThanOrEqual(16_384)
    await expect(
      renderLatexToPng("x+".repeat(500), {
        maxRasterWidth: 128,
        maxRasterHeight: 128,
      }),
    ).rejects.toThrow(/aspect ratio/)
  })

  test("bounds graphics input before invoking MathJax", async () => {
    await expect(renderLatexToSvg("12345", { maxSourceLength: 4 })).rejects.toThrow(/4-character limit/)
    await expect(
      renderLatexToSvg("{".repeat(20) + "x" + "}".repeat(20), { maxDepth: 16 }),
    ).rejects.toThrow(/16-level limit/)
  })

  test("encodes chunked Kitty transmission and stable placement", () => {
    const png = new Uint8Array(5_000).fill(42)
    const transmission = encodeKittyPng(png, 17)
    const placement = encodeKittyPlacement({
      imageId: 17,
      column: 4,
      row: 3,
      columns: 12,
      rows: 5,
    })

    expect(transmission).toStartWith("\u001b_Ga=t,f=100,i=17,q=2,m=1;")
    expect(transmission).toContain("\u001b_Gq=2,m=0;")
    expect(placement).toContain("\u001b[3;4H")
    expect(placement).toContain("a=p,i=17,p=17,q=2,c=12,r=5,z=1,C=1;")
    expect(encodeKittyDelete(17)).toBe("\u001b_Ga=d,d=I,i=17,q=2;\u001b\\")
  })

  test("preserves image aspect ratio when fitting a narrow panel", () => {
    const fitted = fitImageToCells(1_000, 100, 10, 20, 20, 10)

    expect(fitted).toEqual({ columns: 20, rows: 1 })
    expect((fitted.columns * 10) / (fitted.rows * 20)).toBe(10)
  })

  test("keeps a stable cell footprint when terminal pixels grow during zoom", () => {
    const normal = fitImageToCells(400, 160, 8, 16, 50, 10, true)
    const zoomed = fitImageToCells(400, 160, 16, 32, 50, 10, true)

    expect(normal).toEqual({ columns: 50, rows: 10 })
    expect(zoomed).toEqual(normal)
  })

  test("recognizes Ghostty even before the active capability query completes", () => {
    expect(knownKittyGraphicsTerminal("", { TERM_PROGRAM: "ghostty", TERM: "xterm-ghostty" })).toBe(true)
    expect(knownKittyGraphicsTerminal("ghostty", {})).toBe(true)
    expect(knownKittyGraphicsTerminal("ghostty", { TMUX: "/tmp/tmux-501/default,1,0" })).toBe(false)
  })

  test("uploads and places a rendered image after an OpenTUI frame", async () => {
    const setup = await createTestRenderer({ width: 60, height: 16 })
    const output: string[] = []
    const renderer = setup.renderer as any
    Object.defineProperties(renderer, {
      capabilities: {
        configurable: true,
        value: { kitty_graphics: true, multiplexer: "none" },
      },
      resolution: {
        configurable: true,
        value: { width: 600, height: 320 },
      },
      writeTerminal: {
        configurable: true,
        value: (data: string) => {
          output.push(data)
          return true
        },
      },
    })

    const math = new GraphicalLatexRenderable(renderer, {
      content: String.raw`\int_0^\infty e^{-x^2}\,dx`,
      fontSize: 28,
    })
    renderer.root.add(math)

    expect(await math.whenGraphicsReady()).toBe(true)
    await setup.renderOnce()
    expect(output.some((value) => value.includes("a=t,f=100"))).toBe(true)
    expect(output.some((value) => value.includes("a=p,i="))).toBe(true)

    math.destroy()
    setup.renderer.destroy()
  })

  test("keeps Kitty placement cell-relative when the terminal resolution changes", async () => {
    const setup = await createTestRenderer({ width: 60, height: 16 })
    const output: string[] = []
    const renderer = setup.renderer as any
    Object.defineProperties(renderer, {
      capabilities: {
        configurable: true,
        value: { kitty_graphics: true, multiplexer: "none" },
      },
      resolution: {
        configurable: true,
        value: { width: 480, height: 256 },
      },
      writeTerminal: {
        configurable: true,
        value: (data: string) => {
          output.push(data)
          return true
        },
      },
    })
    const math = new GraphicalLatexRenderable(renderer, {
      content: String.raw`\int_0^\infty e^{-x^2}\,dx`,
      width: 50,
      height: 10,
    })
    renderer.root.add(math)

    expect(await math.whenGraphicsReady()).toBe(true)
    await setup.renderOnce()
    const normalPlacement = latestPlacementSize(output)

    output.length = 0
    Object.defineProperty(renderer, "resolution", {
      configurable: true,
      value: { width: 960, height: 512 },
    })
    renderer.emit("resize", 60, 16)
    await setup.renderOnce()
    const zoomedPlacement = latestPlacementSize(output)

    expect(normalPlacement).toBeDefined()
    expect(zoomedPlacement).toEqual(normalPlacement)

    math.destroy()
    setup.renderer.destroy()
  })

  test("keeps an explicit graphics color independent from the cell fallback color", async () => {
    const setup = await createTestRenderer({ width: 20, height: 6 })
    const renderer = setup.renderer as any
    Object.defineProperties(renderer, {
      capabilities: {
        configurable: true,
        value: { kitty_graphics: true, multiplexer: "none" },
      },
      writeTerminal: {
        configurable: true,
        value: () => true,
      },
    })
    const math = new GraphicalLatexRenderable(renderer, {
      content: "x",
      graphicsForegroundColor: "#ff0000",
    })

    math.foregroundColor = "#0000ff"
    expect(math.graphicsForegroundColor).toBe("#ff0000")
    math.graphicsForegroundColor = "#00ff00"
    expect(math.graphicsForegroundColor).toBe("#00ff00")
    math.graphicsForegroundColor = undefined
    expect(math.graphicsForegroundColor).toBe("rgba(0, 0, 255, 1)")

    math.destroy()
    setup.renderer.destroy()
  })

  test("uses the current background color while graphics are active", async () => {
    const setup = await createTestRenderer({ width: 8, height: 4 })
    const renderer = setup.renderer as any
    Object.defineProperties(renderer, {
      capabilities: {
        configurable: true,
        value: { kitty_graphics: true, multiplexer: "none" },
      },
      resolution: {
        configurable: true,
        value: { width: 80, height: 80 },
      },
      writeTerminal: {
        configurable: true,
        value: () => true,
      },
    })
    const math = new GraphicalLatexRenderable(renderer, {
      content: "x",
      width: 4,
      height: 2,
      backgroundColor: "#111111",
    })
    renderer.root.add(math)
    expect(await math.whenGraphicsReady()).toBe(true)

    math.backgroundColor = "#223344"
    await setup.renderOnce()
    const backgrounds = setup
      .captureSpans()
      .lines.flatMap((line) => line.spans)
      .map((span) => span.bg.toInts().join(","))
    expect(backgrounds).toContain("34,51,68,255")

    math.destroy()
    setup.renderer.destroy()
  })

  test("shows the source fallback instead of rasterizing an incomplete prefix", async () => {
    const setup = await createTestRenderer({ width: 24, height: 5 })
    const output: string[] = []
    const renderer = setup.renderer as any
    Object.defineProperties(renderer, {
      capabilities: {
        configurable: true,
        value: { kitty_graphics: true, multiplexer: "none" },
      },
      writeTerminal: {
        configurable: true,
        value: (data: string) => {
          output.push(data)
          return true
        },
      },
    })
    const math = new GraphicalLatexRenderable(renderer, {
      content: "x",
      fallback: "source",
    })
    renderer.root.add(math)
    expect(await math.whenGraphicsReady()).toBe(true)
    output.length = 0

    math.content = String.raw`\begin{bmatrix}1&2\\`
    expect(math.latexError).toBeDefined()
    expect(await math.whenGraphicsReady()).toBe(false)
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain(String.raw`\begin{bmatrix}`)
    expect(output.some((value) => value.includes("a=t,f=100"))).toBe(false)

    math.destroy()
    setup.renderer.destroy()
  })

  test("waits for the latest raster when content changes during readiness", async () => {
    const setup = await createTestRenderer({ width: 60, height: 12 })
    const renderer = setup.renderer as any
    Object.defineProperties(renderer, {
      capabilities: {
        configurable: true,
        value: { kitty_graphics: true, multiplexer: "none" },
      },
      writeTerminal: {
        configurable: true,
        value: () => true,
      },
    })
    const math = new GraphicalLatexRenderable(renderer, { content: "x" })
    const readiness = math.whenGraphicsReady()
    math.content = String.raw`\begin{bmatrix}1&2&3\\4&5&6\\7&8&9\end{bmatrix}`

    expect(await readiness).toBe(true)
    expect(math.graphicsError).toBeUndefined()

    math.destroy()
    setup.renderer.destroy()
  })

  test("does not place an image while the renderable is invisible", async () => {
    const setup = await createTestRenderer({ width: 20, height: 6 })
    const output: string[] = []
    const renderer = setup.renderer as any
    Object.defineProperties(renderer, {
      capabilities: {
        configurable: true,
        value: { kitty_graphics: true, multiplexer: "none" },
      },
      writeTerminal: {
        configurable: true,
        value: (data: string) => {
          output.push(data)
          return true
        },
      },
    })
    const math = new GraphicalLatexRenderable(renderer, {
      content: "x",
      visible: false,
    })
    renderer.root.add(math)
    expect(await math.whenGraphicsReady()).toBe(true)
    await setup.renderOnce()

    expect(output.some((value) => value.includes("a=p,i="))).toBe(false)

    math.destroy()
    setup.renderer.destroy()
  })

  test("graphics entry point preloads MathJax before a real CliRenderer setup", async () => {
    const source = `
      import { createCliRenderer } from "@opentui/core";
      import { renderLatexToPng } from "./src/graphics/index.ts";
      const renderer = await createCliRenderer({ exitOnCtrlC: false });
      const image = await renderLatexToPng(String.raw\`\\\\sqrt{x^2+y^2}\`, { fontSize: 24 });
      renderer.destroy();
      if (image.width < 20) throw new Error("PNG was not rendered");
      console.log("graphics-preload-ok");
    `
    const process = Bun.spawn(["bun", "-e", source], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...Bun.env,
        TERM: "xterm-ghostty",
        TERM_PROGRAM: "ghostty",
      },
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ])

    expect(exitCode, stderr).toBe(0)
    expect(stdout).toContain("graphics-preload-ok")
  })

  test("can initialize graphics lazily after an OpenTUI renderer", async () => {
    const source = `
      import { createCliRenderer } from "@opentui/core";
      const renderer = await createCliRenderer({ exitOnCtrlC: false });
      const { renderLatexToPng } = await import("./src/graphics/render.ts");
      const image = await renderLatexToPng(String.raw\`\\\\sqrt{x^2+y^2}\`, { fontSize: 24 });
      renderer.destroy();
      if (image.width < 20) throw new Error("PNG was not rendered");
      console.log("graphics-lazy-ok");
    `
    const process = Bun.spawn(["bun", "-e", source], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...Bun.env,
        TERM: "xterm-ghostty",
        TERM_PROGRAM: "ghostty",
      },
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ])

    expect(exitCode, stderr).toBe(0)
    expect(stdout).toContain("graphics-lazy-ok")
  })
})

function latestPlacementSize(output: string[]): { columns: number; rows: number } | undefined {
  const placement = output.filter((value) => value.includes("a=p,i=")).at(-1)
  const match = placement?.match(/(?:^|,)c=(\d+),r=(\d+)(?:,|;)/)
  return match ? { columns: Number(match[1]), rows: Number(match[2]) } : undefined
}
