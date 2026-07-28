declare module "mathjax" {
  const MathJax: {
    init(config: Record<string, unknown>): Promise<unknown>
  }

  export default MathJax
}
