import { PaperError } from '../../cli';

export class PackageManagerNotFound extends PaperError {
  constructor(private packageManagerName: string) {
    super();
  }

  report() {
    return `package manager: ${this.packageManagerName} was not found`;
  }
}
