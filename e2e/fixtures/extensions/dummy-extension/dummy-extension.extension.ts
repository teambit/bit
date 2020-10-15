export class DummyExtension {
  constructor() {}

  static dependencies: any = [];

  static async provider() {
    console.log('dummy extension runs');
  }
}
