// @flow

export default class OutdatedIndexJson extends Error {
  componentId: string;
  indexJsonPath: string;
  constructor(componentId: string, indexJsonPath: string) {
    super();
    this.componentId = componentId;
    this.indexJsonPath = indexJsonPath;
  }
}
