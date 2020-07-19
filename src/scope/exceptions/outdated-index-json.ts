export default class OutdatedIndexJson extends Error {
  id: string;
  indexJsonPath: string;
  showDoctorMessage: boolean;

  constructor(id: string, indexJsonPath: string) {
    super();
    this.id = id;
    this.indexJsonPath = indexJsonPath;
    this.showDoctorMessage = true;
  }
}
