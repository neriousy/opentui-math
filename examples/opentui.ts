import { BoxRenderable, TextRenderable, createCliRenderer } from "@opentui/core"
import { LatexRenderable } from "../src/index.js"

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  backgroundColor: "#11111b",
})

const page = new BoxRenderable(renderer, {
  width: "100%",
  height: "100%",
  flexDirection: "column",
  padding: 2,
  gap: 1,
  backgroundColor: "#11111b",
})

page.add(
  new TextRenderable(renderer, {
    content: "opentui-math",
    fg: "#cba6f7",
    attributes: 1,
  }),
)
page.add(
  new TextRenderable(renderer, {
    content: "LaTeX structure, typeset directly in terminal cells",
    fg: "#6c7086",
  }),
)

const gallery = new BoxRenderable(renderer, {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 2,
  marginTop: 1,
})

const formulas = [
  [String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`, "#89b4fa"],
  [String.raw`\sum_{i=1}^{n} i^2 = \frac{n(n+1)(2n+1)}{6}`, "#a6e3a1"],
  [String.raw`A = \begin{pmatrix}a & b \\ c & d\end{pmatrix}`, "#f9e2af"],
  [String.raw`\lim_{n \to \infty}\left(1+\frac{1}{n}\right)^n=e`, "#f5c2e7"],
] as const

for (const [content, color] of formulas) {
  const card = new BoxRenderable(renderer, {
    minWidth: 34,
    minHeight: 8,
    padding: 1,
    border: true,
    borderStyle: "rounded",
    borderColor: "#313244",
    backgroundColor: "#181825",
    alignItems: "center",
    justifyContent: "center",
  })
  card.add(new LatexRenderable(renderer, { content, foregroundColor: color }))
  gallery.add(card)
}

page.add(gallery)
renderer.root.add(page)
