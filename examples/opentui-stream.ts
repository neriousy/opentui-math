import {
  BoxRenderable,
  TextAttributes,
  TextRenderable,
  createCliRenderer,
} from "@opentui/core"
import {
  completeLatexPrefix,
  GraphicalLatexRenderable,
  LatexStreamController,
} from "../src/graphics/index.js"

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
})

const panel = new BoxRenderable(renderer, {
  width: "92%",
  maxWidth: 90,
  minHeight: 22,
  border: true,
  borderStyle: "rounded",
  borderColor: "#30303a",
  backgroundColor: "#111116",
  padding: 2,
  flexDirection: "column",
  gap: 1,
})

panel.add(
  new TextRenderable(renderer, {
    content: "Streaming LaTeX",
    fg: "#f4f4f5",
    attributes: TextAttributes.BOLD,
  }),
)
panel.add(
  new TextRenderable(renderer, {
    content:
      "Broken command fragments stay as source; repairable prefixes are temporarily closed and rendered.",
    fg: "#777783",
  }),
)

const formula = new GraphicalLatexRenderable(renderer, {
  content: "",
  fallback: "source",
  strict: true,
  foregroundColor: "#a6e3a1",
  errorColor: "#777783",
  fontSize: 34,
  graphicsMode: "kitty",
  width: "100%",
  minHeight: 14,
})
panel.add(formula)
page.add(panel)
renderer.root.add(page)

const stream = new LatexStreamController(formula, {
  incompletePolicy: "apply",
  updateIntervalMs: 25,
  validationOptions: { strict: true },
  preview: completeLatexPrefix,
})

const deltas = [
  String.raw`\beg`,
  String.raw`in{aligned}`,
  String.raw`\mathbf{A} &= \begin{bmatrix}`,
  "1&2&3",
  String.raw`\\`,
  "4&5&6",
  String.raw`\\`,
  "7&8&9",
  String.raw`\end{bmatrix},\\`,
  String.raw`p(\lambda) &= \det(\mathbf{A}-\lambda I),\\`,
  String.raw`\frac{d}{d\lambda}p(\lambda) &= `,
  String.raw`\lim_{h\to 0}`,
  String.raw`\frac{p(\lambda+h)-p(\lambda)}{h}`,
  String.raw`\end{aligned}`,
]

for (let index = 0; index < deltas.length; index++) {
  stream.append(deltas[index]!)
  if (index === deltas.length - 1) await stream.finish()
  else await stream.flush()
  await pause(110)
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
