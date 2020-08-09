import { PaperError } from '../../cli';

export class CannotLoadExtension extends PaperError {
  constructor(private extensionName: string, private error: Error) {
    super();
  }

  report(verbose?: boolean) {
    if (verbose) return `could not find load extension: ${this.extensionName}. ${this.error} `;
    return `could not find load extension: ${this.extensionName}. `;
  }

  toJson() {}
}
