export class RuntimeModuleError extends Error {
  constructor(private err: Error) {
    super(`failed to load Harmony aspect with error message: ${err.message}`);
  }

  get stack() {
    return this.err.stack;
  }
}
