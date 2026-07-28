import { describe, expect, test } from "bun:test"
import { renderLatexToString } from "../src/index.js"

const formulas = {
  quadratic: String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
  euler: String.raw`e^{i\pi} + 1 = 0`,
  gaussian: String.raw`\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`,
  matrix: String.raw`A = \begin{pmatrix}a & b \\ c & d\end{pmatrix}`,
  limit: String.raw`\lim_{n \to \infty}\left(1+\frac{1}{n}\right)^n=e`,
  cases: String.raw`|x| = \begin{cases}x & x \ge 0 \\ -x & x < 0\end{cases}`,
  maxwell: String.raw`\begin{aligned}
    \nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
    \nabla \times \mathbf{B} &= \mu_0\mathbf{J} + \mu_0\varepsilon_0
      \frac{\partial \mathbf{E}}{\partial t}
  \end{aligned}`,
} as const

describe("textbook formula visual regressions", () => {
  for (const [name, source] of Object.entries(formulas)) {
    test(name, () => {
      expect(renderLatexToString(source)).toMatchSnapshot()
    })
  }
})
