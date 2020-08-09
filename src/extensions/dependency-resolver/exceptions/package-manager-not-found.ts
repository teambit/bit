import { PaperError } from '../../cli';

export class PackageManagerNotFound extends PaperError {
  constructor(private packageManagerName: string) {
    super(`package manager: ${packageManagerName} was not found`);
  }

  report() {
    return this.message;
  }
}
