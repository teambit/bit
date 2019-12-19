import { RunOptions, PipeOptions } from './run-options';
import Component from '../consumer/component/consumer-component';
import { BitCapsule } from '../capsule';

function getDefaultOptions(): PipeOptions {
  return {
    bail: true,
    keep: false
  };
}

export interface Runnable {
  run(component: Component, capsule: BitCapsule): Promise<any>;
}

export class Pipe implements Runnable {
  constructor(public elements: Runnable[] = [], public options: PipeOptions = getDefaultOptions()) {}

  async run(component: Component, capsule: BitCapsule = {} as BitCapsule): Promise<any> {
    const options = this.options;
    const results = await Promise.all(
      this.elements.map(async function(elem: Runnable) {
        try {
          await elem.run(component, capsule);
        } catch (e) {
          if (options.bail) {
            throw new Error(e);
          }
        }
      })
    );
    if (!options.keep) {
      capsule.destroy;
    }
  }
}

export type PipeElementConfig =
  | string
  | {
      id: string;
    };

export class PipeElement implements Runnable {
  constructor(public config: PipeElementConfig) {}
  run(component: Component, capsule: BitCapsule): Promise<any> {
    return Promise.resolve();
  }

  id() {
    return typeof this.config === 'string' ? this.config : this.config.id;
  }
}
