// eslint-disable-next-line max-classes-per-file
import { RunOptions, PipeOptions } from './run-configuration';
import Component from '../consumer/component/consumer-component';
import { BitCapsule } from '../capsule';
import { PipeElement } from './pipe-element';

export function getDefaultOptions(): PipeOptions {
  return {
    bail: true,
    keep: false
  };
}

export interface Runnable {
  run({ component: Component, capsule: BitCapsule }): Promise<any>;
}

// eslint-disable-next-line import/prefer-default-export
export class Pipe implements Runnable {
  constructor(public elements: PipeElement[] = [], public options: PipeOptions = getDefaultOptions()) {}

  async run({ component, capsule = {} as BitCapsule }: { component: Component; capsule: BitCapsule }): Promise<any> {
    const options = this.options;
    const results = await Promise.all(
      this.elements.map(async function(elem: Runnable) {
        try {
          await elem.run({ component, capsule });
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

// eslint-disable-next-line import/prefer-default-export
