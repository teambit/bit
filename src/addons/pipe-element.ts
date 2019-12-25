import { Runnable } from './pipe';
import { loadConsumer, Consumer } from '../consumer';

export class PipeElement implements Runnable {
  constructor(public config: PipeElementConfig) {}
  async un({ component: Component, capsule: BitCapsule }): Promise<any> {
    const consumer: Consumer = await loadConsumer();
    const result = await consumer.importEnvironment(new BitId(this.id()));
    const extension = {} as any;
    return Promise.resolve();
  }

  id() {
    return typeof this.config === 'string' ? this.config : this.config.id;
  }
}
export type PipeElementConfig = string | { id: string };
