// @flow
export default class NewerVersionFound extends Error {
  componentId: string;
  currentVersion: string;
  newestVersion: string;

  constructor(componentId: string, currentVersion: string, newestVersion: string) {
    super();
    this.name = 'NewerVersionFound';
    this.componentId = componentId;
    this.currentVersion = currentVersion;
    this.newestVersion = newestVersion;
  }
}
