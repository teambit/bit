export class AspectExtension {
  static id = '@teambit/aspect';

  static async provider() {
    return new AspectExtension();
  }
}
