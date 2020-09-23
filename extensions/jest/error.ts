export class JestError extends Error {
  constructor(message: string, stack?: string | null, public readonly code?: unknown, type?: string) {
    super(message);
  }

  get stack() {
    return this.stack;
  }
}
