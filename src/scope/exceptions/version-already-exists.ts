import { BitError } from '@teambit/bit-error';

export default class VersionAlreadyExists extends BitError {
  version: string;
  componentId: string;
  showDoctorMessage: boolean;

  constructor(version: string, componentId: string) {
    super(`error: version ${version} already exists for ${componentId}`);
    this.version = version;
    this.componentId = componentId;
    this.showDoctorMessage = true;
  }
}
