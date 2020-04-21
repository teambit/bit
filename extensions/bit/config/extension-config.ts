import { BitId as ComponentId } from 'bit-bin/dist/bit-id';
import { AnyMap } from './types';

export class ExtensionConfig {
  constructor(private id: ComponentId, private config: { [key: string]: any }) {}

  static fromObject(object: RawExtensionConfig) {
    return new ExtensionConfig(ComponentId.parse(object.name), object.config);
  }
}

export type RawExtensionConfig = {
  name: string;
  config: AnyMap;
};
