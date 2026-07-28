import { BoxRenderable, TextAttributes, TextRenderable, createCliRenderer } from "@opentui/core"
import { GraphicalLatexRenderable } from "../src/graphics/index.js"

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  backgroundColor: "#0b0b0e",
})

const page = new BoxRenderable(renderer, {
  width: "100%",
  height: "100%",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#0b0b0e",
  padding: 1,
})

const panel = new BoxRenderable(renderer, {
  width: "100%",
  maxWidth: 122,
  border: true,
  borderStyle: "rounded",
  borderColor: "#30303a",
  backgroundColor: "#111116",
  padding: 1,
  flexDirection: "column",
  gap: 1,
})

panel.add(
  new TextRenderable(renderer, {
    content: "High-resolution LaTeX gallery",
    fg: "#f4f4f5",
    attributes: TextAttributes.BOLD,
  }),
)
panel.add(
  new TextRenderable(renderer, {
    content: "New Computer Modern · MathJax SVG · Kitty terminal graphics",
    fg: "#777783",
  }),
)

const gallery = new BoxRenderable(renderer, {
  width: "100%",
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 1,
})
const graphicalFormulas: GraphicalLatexRenderable[] = []

const formulas = [
  {
    title: "Square and cube roots",
    content: String.raw`\sqrt{x^2+y^2}\qquad \sqrt[3]{\frac{a+b}{c}}`,
    color: "#89b4fa",
  },
  {
    title: "Matrices",
    content: String.raw`A=\begin{bmatrix}1&2&3\\4&5&6\\7&8&9\end{bmatrix}`,
    color: "#a6e3a1",
  },
  {
    title: "Limits",
    content: String.raw`\lim_{x\to0}\frac{\sin x}{x}=1,\qquad \lim_{n\to\infty}\left(1+\frac1n\right)^n=e`,
    color: "#f9e2af",
  },
  {
    title: "Aligned equations",
    content: String.raw`\begin{aligned}(a+b)^2&=a^2+2ab+b^2,\\(a-b)^2&=a^2-2ab+b^2.\end{aligned}`,
    color: "#f5c2e7",
  },
  {
    title: "Cases with text",
    content: String.raw`\operatorname{sgn}(x)=\begin{cases}-1,&\text{if }x<0,\\0,&\text{if }x=0,\\1,&\text{if }x>0.\end{cases}`,
    color: "#cba6f7",
  },
  {
    title: "Maxwell’s equations",
    content: String.raw`\begin{aligned}\nabla\cdot\mathbf E&=\frac{\rho}{\varepsilon_0},&\nabla\cdot\mathbf B&=0,\\\nabla\times\mathbf E&=-\frac{\partial\mathbf B}{\partial t},&\nabla\times\mathbf B&=\mu_0\mathbf J+\mu_0\varepsilon_0\frac{\partial\mathbf E}{\partial t}.\end{aligned}`,
    color: "#94e2d5",
  },
] as const

for (const formula of formulas) {
  const card = new BoxRenderable(renderer, {
    width: 58,
    minHeight: 12,
    border: true,
    borderStyle: "rounded",
    borderColor: "#2a2a33",
    backgroundColor: "#18181f",
    padding: 1,
    flexDirection: "column",
  })
  card.add(
    new TextRenderable(renderer, {
      content: formula.title,
      fg: "#8b8b98",
      attributes: TextAttributes.BOLD,
    }),
  )
  const graphicalFormula = new GraphicalLatexRenderable(renderer, {
    content: formula.content,
    foregroundColor: formula.color,
    fontSize: 29,
    width: "100%",
    minHeight: 8,
    graphicsMode: "kitty",
    graphicsZIndex: 2,
  })
  graphicalFormulas.push(graphicalFormula)
  card.add(graphicalFormula)
  gallery.add(card)
}

panel.add(gallery)
const readiness = await Promise.all(graphicalFormulas.map((formula) => formula.whenGraphicsReady()))
const readyCount = readiness.filter(Boolean).length
const firstError = graphicalFormulas.find((formula) => formula.graphicsError)?.graphicsError
panel.add(
  new TextRenderable(renderer, {
    content:
      readyCount === graphicalFormulas.length
        ? `Graphics ready: ${readyCount}/${graphicalFormulas.length} images · Ctrl-C to exit`
        : `Graphics unavailable: ${readyCount}/${graphicalFormulas.length} ready · ${firstError?.message ?? "OpenTUI terminal output bridge missing"}`,
    fg: readyCount === graphicalFormulas.length ? "#6c8f7d" : "#f38ba8",
  }),
)
page.add(panel)
renderer.root.add(page)
