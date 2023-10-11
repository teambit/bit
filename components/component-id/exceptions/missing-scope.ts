export class MissingScope extends Error {
  constructor(src: any) {
    super(`scope is missing from a component-id "${src}"`);
  }
  report() {
    return this.message;
  }
}
