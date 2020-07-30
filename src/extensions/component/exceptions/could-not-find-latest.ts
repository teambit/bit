import { PaperError } from '../../cli';

export class CouldNotFindLatest extends PaperError {
  constructor(private semverArray: string[]) {
    super();
  }

  report() {
    return `could not find latest semver in array: ${this.semverArray.join(', ')}`;
  }
}
