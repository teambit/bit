export class MissingScope extends Error {
  constructor(src: any) {
    super(`scope was not defined directly or by "${src}"`);
  }
  report() {
    return this.message;
  }
}
