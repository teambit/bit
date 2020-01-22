import Extension from '../extension';

export default class LoadExtensionError extends Error {
  constructor(private extension: Extension, private err: Error) {
    super();
  }

  toString() {
    return `failed to load extension: ${this.extension.name} with error: ${this.err}`;
  }
}
