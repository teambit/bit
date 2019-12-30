import { Runnable } from './pipe';
import Component from '../consumer/component/consumer-component';
import { BitCapsule } from '../capsule';
import { BitId } from '../bit-id';
import { importExtensionObject } from './extension';
import { ExtensionAPI } from './extension-api';

export class PipeElement implements Runnable {
  constructor(public config: PipeElementConfig) {}
  async run({ component, capsule }: { component: Component; capsule: BitCapsule }): Promise<any> {
    const extensionId = BitId.parse(this.id());
    let extensionComponent = await importExtensionObject(extensionId);
    const api = new ExtensionAPI(component, capsule, extensionComponent);
    return extensionComponent.run(api);
  }

  id() {
    return typeof this.config === 'string' ? this.config : this.config.id;
  }
}
export type PipeElementConfig = string | { id: string };
