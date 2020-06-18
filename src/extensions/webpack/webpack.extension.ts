export class WebpackExtension {
  createBundler() {}

  createDevServer() {}

  static async provide() {
    return new WebpackExtension();
  }
}
