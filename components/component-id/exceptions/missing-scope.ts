export class MissingScope extends Error {
  constructor(src: any) {
    super(`scope is missing from a component-id "${src.toString()}"`);
  }
  report() {
    return this.message;
  }
}
