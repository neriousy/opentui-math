import { afterEach, describe, expect, test } from "bun:test"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import {
  completeLatexPrefix,
  LatexRenderable,
  LatexStreamController,
  parseLatex,
} from "../src/index.js"

let setup: TestRendererSetup | undefined

afterEach(() => {
  setup?.renderer.destroy()
  setup = undefined
})

describe("LatexStreamController", () => {
  test("retains the last good frame for incomplete AI-token prefixes", async () => {
    setup = await createTestRenderer({ width: 20, height: 6 })
    const latex = new LatexRenderable(setup.renderer, {
      content: "x",
      fallback: "throw",
    })
    setup.renderer.root.add(latex)
    const stream = new LatexStreamController(latex, { updateIntervalMs: 60_000 })

    stream.replace(String.raw`\frac{`)
    const incomplete = await stream.flush()
    await setup.renderOnce()

    expect(incomplete.applied).toBe(false)
    expect(incomplete.complete).toBe(false)
    expect(latex.content).toBe("x")
    expect(setup.captureCharFrame()).toContain("x")
    expect(setup.captureCharFrame()).not.toContain("LaTeX error")

    stream.replace(String.raw`\frac{x+1}{2}`)
    const complete = await stream.finish()
    await setup.renderOnce()

    expect(complete).toMatchObject({ applied: true, complete: true })
    expect(setup.captureCharFrame()).toContain("x + 1")
    expect(setup.captureCharFrame()).toContain("───────")
  })

  test("coalesces many deltas into one target update", async () => {
    let content = ""
    let updates = 0
    const target = {
      get content() {
        return content
      },
      set content(value: string) {
        content = value
        updates++
      },
    }
    const stream = new LatexStreamController(target, { updateIntervalMs: 60_000 })

    for (const chunk of ["\\", "f", "r", "a", "c", "{x}", "{2}"]) stream.append(chunk)
    expect(updates).toBe(0)

    const result = await stream.finish()
    expect(result).toMatchObject({ applied: true, complete: true })
    expect(content).toBe(String.raw`\frac{x}{2}`)
    expect(updates).toBe(1)
  })

  test("waits for a graphical target on explicit flush", async () => {
    let content = ""
    let readinessCalls = 0
    const target = {
      get content() {
        return content
      },
      set content(value: string) {
        content = value
      },
      async whenGraphicsReady() {
        readinessCalls++
        return true
      },
    }
    const stream = new LatexStreamController(target)
    stream.replace("x^2")

    expect(await stream.flush()).toMatchObject({
      applied: true,
      complete: true,
      graphicsReady: true,
    })
    expect(readinessCalls).toBe(1)
    stream.dispose()
  })

  test("bounds accumulation and rejects updates after finish", async () => {
    const target = { content: "" }
    const stream = new LatexStreamController(target, { maxBufferLength: 4 })
    stream.append("1234")
    expect(() => stream.append("5")).toThrow(/4-character limit/)
    await stream.finish()
    expect(() => stream.append("6")).toThrow(/finished/)
  })

  test("applies a final invalid source through the target error policy", async () => {
    setup = await createTestRenderer({ width: 20, height: 6 })
    const latex = new LatexRenderable(setup.renderer, {
      content: "x",
      fallback: "throw",
    })
    const stream = new LatexStreamController(latex)
    stream.replace(String.raw`\frac{`)

    const result = await stream.finish()
    expect(result.applied).toBe(false)
    expect(result.complete).toBe(false)
    expect(result.error?.message).toContain("Expected")
    expect(latex.content).toBe("x")
  })

  test("can show raw source while a prefix is invalid, then switch to math", async () => {
    setup = await createTestRenderer({ width: 24, height: 6 })
    const latex = new LatexRenderable(setup.renderer, {
      content: "",
      fallback: "source",
    })
    setup.renderer.root.add(latex)
    const stream = new LatexStreamController(latex, {
      incompletePolicy: "apply",
      updateIntervalMs: 60_000,
    })

    stream.replace(String.raw`\begin{bmatrix}1&2\\`)
    const incomplete = await stream.flush()
    await setup.renderOnce()
    expect(incomplete).toMatchObject({ applied: true, complete: false })
    expect(setup.captureCharFrame()).toContain(String.raw`\begin{bmatrix}`)

    stream.replace(String.raw`\begin{bmatrix}1&2\\3&4\end{bmatrix}`)
    const complete = await stream.finish()
    await setup.renderOnce()
    expect(complete).toMatchObject({ applied: true, complete: true })
    expect(setup.captureCharFrame()).toContain("⎡1 2⎤")
    expect(setup.captureCharFrame()).not.toContain(String.raw`\begin`)
  })

  test("builds non-destructive previews for open arguments, delimiters, and environments", () => {
    expect(completeLatexPrefix(String.raw`\frac{1}{`)).toBe(String.raw`\frac{1}{}`)
    expect(completeLatexPrefix(String.raw`\left(\frac{x}{2}`)).toBe(
      String.raw`\left(\frac{x}{2}\right.`,
    )
    expect(
      completeLatexPrefix(String.raw`\begin{aligned}A&=\begin{bmatrix}1&2\\`),
    ).toBe(
      String.raw`\begin{aligned}A&=\begin{bmatrix}1&2\\\end{bmatrix}\end{aligned}`,
    )
    expect(completeLatexPrefix(String.raw`\beg`)).toBeUndefined()
  })

  test("renders a repaired prefix without changing the accumulated stream", async () => {
    let content = "x"
    const target = {
      get content() {
        return content
      },
      set content(value: string) {
        content = value
      },
    }
    const stream = new LatexStreamController(target, {
      updateIntervalMs: 60_000,
      validate: (source) => {
        parseLatex(source, { strict: true })
      },
      preview: completeLatexPrefix,
    })

    stream.replace(String.raw`\frac{1}{`)
    const preview = await stream.flush()

    expect(preview).toMatchObject({
      source: String.raw`\frac{1}{`,
      renderedSource: String.raw`\frac{1}{}`,
      applied: true,
      complete: false,
    })
    expect(stream.content).toBe(String.raw`\frac{1}{`)
    expect(content).toBe(String.raw`\frac{1}{}`)

    stream.replace(String.raw`\frac{1}{2}`)
    const complete = await stream.finish()
    expect(complete).toMatchObject({ applied: true, complete: true })
    expect(complete.renderedSource).toBeUndefined()
    expect(content).toBe(String.raw`\frac{1}{2}`)
  })

  test("rejects a preview that a custom validator reports as incomplete", async () => {
    const target = { content: "x" }
    const stream = new LatexStreamController(target, {
      updateIntervalMs: 60_000,
      validate: (source) => source === "done",
      preview: () => "still incomplete",
    })

    stream.replace("partial")
    expect(await stream.flush()).toMatchObject({ applied: false, complete: false })
    expect(target.content).toBe("x")
    stream.dispose()
  })

  test("honors strict validation for unfinished command names", async () => {
    const target = { content: "x" }
    const stream = new LatexStreamController(target, {
      updateIntervalMs: 60_000,
      validationOptions: { strict: true },
    })

    stream.replace(String.raw`\beg`)
    expect(await stream.flush()).toMatchObject({ applied: false, complete: false })
    expect(target.content).toBe("x")
    stream.dispose()
  })
})
