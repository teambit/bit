export class ReadConfigError extends Error {
  constructor(path, private err) {
    super(`failed to read config from path: ${path}`);
  }

  get stack() {
    return this.err.stack;
  }
}
