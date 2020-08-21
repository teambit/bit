import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';
import type { AspectDescriptor } from '@teambit/aspect-loader';

export class ExtensionArtifact {
  constructor(readonly files: AbstractVinyl[], readonly extensionDescriptor: AspectDescriptor) {}

  toObject() {
    return {
      extensionDescriptor: this.extensionDescriptor,
    };
  }
}
