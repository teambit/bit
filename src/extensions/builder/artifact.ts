import { AbstractVinyl } from '../../consumer/component/sources';
import { ExtensionDescriptor } from '../core';

export class ExtensionArtifact {
  constructor(readonly files: AbstractVinyl[], readonly extensionDescriptor: ExtensionDescriptor) {}

  toObject() {
    return {
      extensionDescriptor: this.extensionDescriptor,
    };
  }
}
