import { Runnable } from './pipe';
import { loadConsumer, Consumer } from '../consumer';
import Component from '../consumer/component/consumer-component';
import { BitCapsule } from '../capsule';
import { BitId } from '../bit-id';
import { UserExtension } from './extension';
import {} from '../scope/extensions/install-extensions';

export class PipeElement implements Runnable {
  private _extension: UserExtension | null = null;

  constructor(public config: PipeElementConfig) {}
  async run({ component, capsule }: { component: Component; capsule: BitCapsule }): Promise<any> {
    const consumer: Consumer = await loadConsumer();
    const extensionId = BitId.parse(this.id());
    const extensionComponent = (await consumer.importEnvironment(extensionId, false, true))[0];
    extensionComponent.component.scope;

    return Promise.resolve();
  }

  id() {
    return typeof this.config === 'string' ? this.config : this.config.id;
  }

  get extension() {
    if (this._extension == null) {
      this._extension = loadExtension();
    }
    return this._extension;
  }
}

function loadExtension(): UserExtension {
  return {
    run: {} as any
  };
}

export type PipeElementConfig = string | { id: string };
