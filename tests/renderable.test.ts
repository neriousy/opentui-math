import { afterEach, describe, expect, test } from "bun:test"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { LatexRenderable } from "../src/index.js"

let setup: TestRendererSetup | undefined

afterEach(() => {
  setup?.renderer.destroy()
  setup = undefined
})

describe("LatexRenderable", () => {
  test("participates in Yoga intrinsic layout and paints the OpenTUI buffer", async () => {
    setup = await createTestRenderer({ width: 20, height: 6 })
    const latex = new LatexRenderable(setup.renderer, {
      content: String.raw`\frac{x+1}{2}`,
      position: "absolute",
      left: 1,
      top: 1,
    })
    setup.renderer.root.add(latex)

    await setup.renderOnce()
    const frame = setup.captureCharFrame()

    expect(latex.width).toBe(7)
    expect(latex.height).toBe(3)
    expect(frame).toContain("x + 1")
    expect(frame).toContain("───────")
  })

  test("can be updated without replacing the renderable", async () => {
    setup = await createTestRenderer({ width: 20, height: 6 })
    const latex = new LatexRenderable(setup.renderer, { content: "x^2" })
    setup.renderer.root.add(latex)
    await setup.renderOnce()

    latex.content = String.raw`\sqrt{x}`
    await setup.renderOnce()

    expect(latex.intrinsicHeight).toBe(2)
    expect(setup.captureCharFrame()).toContain("√")
  })

  test("keeps content and layout unchanged when a throwing update is invalid", async () => {
    setup = await createTestRenderer({ width: 20, height: 6 })
    const latex = new LatexRenderable(setup.renderer, {
      content: "x",
      fallback: "throw",
    })
    setup.renderer.root.add(latex)
    await setup.renderOnce()

    expect(() => {
      latex.content = String.raw`\frac{`
    }).toThrow()
    await setup.renderOnce()

    expect(latex.content).toBe("x")
    expect(setup.captureCharFrame()).toContain("x")
  })

  test("bounds the raw-source fallback for oversized streamed input", async () => {
    setup = await createTestRenderer({ width: 20, height: 3 })
    const source = "x".repeat(100_001)
    const latex = new LatexRenderable(setup.renderer, {
      content: source,
      fallback: "source",
    })
    setup.renderer.root.add(latex)
    await setup.renderOnce()

    expect(latex.content).toBe(source)
    expect(latex.intrinsicWidth).toBe(2_001)
    expect(setup.captureCharFrame()).toContain("x")
  })
})
