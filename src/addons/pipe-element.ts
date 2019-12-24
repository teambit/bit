import { Runnable } from './pipe';

export class PipeElement implements Runnable {
  constructor(public config: PipeElementConfig) {}
  run({ component: Component, capsule: BitCapsule }): Promise<any> {
    // bring extension
    // require extension
    // run main function with API
    const extension = {} as any;
    return Promise.resolve();
  }

  id() {
    return typeof this.config === 'string' ? this.config : this.config.id;
  }
}
export type PipeElementConfig = string | { id: string };
