export class UnknownUI extends Error {
  constructor(readonly uiRoot: string) {
    super();
  }

  toString() {
    return `unknown UI root: ${this.uiRoot}`;
  }
}
