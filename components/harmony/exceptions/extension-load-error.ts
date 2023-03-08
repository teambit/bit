import { Extension } from '../extension/extension';

export default class ExtensionLoadError extends Error {
  constructor(
    /**
     * failed extension
     */
    private extension: Extension,

    /**
     * extension error
     */
    private originalError: Error,

    /**
     * extension formatted / handled error message
     */
    private msg?: string
  ) {
    super();
  }

  toString() {
    return `failed to load extension: ${this.extension.name} with error:

${this.msg || this.originalError.stack}`;
  }
}
