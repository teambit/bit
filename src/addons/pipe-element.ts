import { Runnable } from './pipe';
import Component from '../consumer/component/consumer-component';
import { BitCapsule } from '../capsule';
import { BitId } from '../bit-id';
import { importExtensionObject } from './extension';
import { ExtensionAPI } from './extension-api';

export class PipeElement implements Runnable {
  constructor(public config: PipeElementConfig) {}
  async run({ component, capsule }: { component: Component; capsule: BitCapsule }): Promise<any> {
    const id = this.id();
    const extensionId = BitId.parse(id);
    let extensionComponent = await importExtensionObject(extensionId);
    const api = new ExtensionAPI(component, capsule, extensionComponent);
    return extensionComponent.run(api, this.getConfig());
  }

  id() {
    return typeof this.config === 'string' ? this.config : this.config.id;
  }
  getConfig() {
    return typeof this.config === 'string' ? { id: this.config } : this.config;
  }
}
export type PipeElementConfig = string | { id: string };
