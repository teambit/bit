import type { AspectDescriptor } from '@teambit/aspect-loader';
import { AbstractVinyl } from '@teambit/component.sources';

export class ExtensionArtifact {
  constructor(
    readonly files: AbstractVinyl[],
    readonly extensionDescriptor: AspectDescriptor
  ) {}

  toObject() {
    return {
      extensionDescriptor: this.extensionDescriptor,
    };
  }
}
