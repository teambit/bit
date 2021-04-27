export class UnknownUI extends Error {
  constructor(readonly uiRoot: string, readonly available?: string[]) {
    super();
  }

  toString() {
    return `Unknown UI root: "${this.uiRoot}". Available ui roots are: [${this.available?.join(', ')}]`;
  }
}
