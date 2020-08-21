import { ComponentID } from '../../component';

export class PreviewArtifactNotFound extends Error {
  constructor(readonly componentId: ComponentID) {
    super();
  }

  toString() {
    return `preview for component ${this.componentId.toString()} was not found`;
  }
}
