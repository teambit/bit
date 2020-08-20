import { AbstractVinyl } from '../../consumer/component/sources';
import type { AspectDescriptor } from '../aspect-loader';

export class ExtensionArtifact {
  constructor(readonly files: AbstractVinyl[], readonly extensionDescriptor: AspectDescriptor) {}

  toObject() {
    return {
      extensionDescriptor: this.extensionDescriptor,
    };
  }
}
