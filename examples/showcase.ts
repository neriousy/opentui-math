import { renderLatexToString } from "../src/index.js"

const formulas = [
  ["Quadratic formula", String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`],
  ["Euler", String.raw`e^{i\pi} + 1 = 0`],
  ["Gaussian integral", String.raw`\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`],
  ["Matrix", String.raw`A = \begin{pmatrix}a & b \\ c & d\end{pmatrix}`],
  ["Limit", String.raw`\lim_{n \to \infty}\left(1+\frac{1}{n}\right)^n=e`],
  ["Cases", String.raw`|x| = \begin{cases}x & x \ge 0 \\ -x & x < 0\end{cases}`],
] as const

for (const [label, latex] of formulas) {
  console.log(`\n${label}\n${"─".repeat(label.length)}`)
  console.log(renderLatexToString(latex))
}
