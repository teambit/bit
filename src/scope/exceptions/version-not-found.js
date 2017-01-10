export default class VersionNotFound extends Error {
  constructor(version: string) {
    super();
    this.version = version;
  }
}
