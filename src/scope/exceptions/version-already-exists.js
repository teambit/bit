// @flow
export default class VersionAlreadyExists extends Error {
  constructor(version: string, componentId: string) {
    super();
    this.version = version;
    this.componentId = componentId;
  }
}
