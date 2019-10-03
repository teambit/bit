export default class OutdatedIndexJson extends Error {
  componentId: string;
  indexJsonPath: string;
  showDoctorMessage: boolean;

  constructor(componentId: string, indexJsonPath: string) {
    super();
    this.componentId = componentId;
    this.indexJsonPath = indexJsonPath;
    this.showDoctorMessage = true;
  }
}
