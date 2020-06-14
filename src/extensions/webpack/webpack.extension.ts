export class WebpackExtension {
  bundle() {}

  static async provide() {
    return new WebpackExtension();
  }
}
