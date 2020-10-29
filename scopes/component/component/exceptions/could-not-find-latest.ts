export class CouldNotFindLatest extends Error {
  constructor(semverArray: string[]) {
    super(`could not find latest semver in array: ${semverArray.join(', ')}`);
  }
  report() {
    return this.message;
  }
}
