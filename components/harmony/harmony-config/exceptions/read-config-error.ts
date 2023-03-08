export class ReadConfigError extends Error {
  constructor(path: string, private err: Error) {
    super(`failed to read config from path: ${path}`);
  }

  get stack() {
    return this.err.stack;
  }
}
