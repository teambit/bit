export class CompositionsExtension {
  static dependencies = [];

  static async provider() {
    return new CompositionsExtension();
  }
}
