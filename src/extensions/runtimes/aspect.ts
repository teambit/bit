import { SlotProvider } from '@teambit/harmony/dist/slots/slot';
import { RuntimeManifest } from './runtimes/runtime-manifest';
import { RuntimeDefinition } from './runtimes';

export type AspectManifest = {
  id: string;
  dependencies?: Aspect[];
  slots?: SlotProvider<unknown>[];
  defaultConfig?: { [key: string]: any };
  declareRuntime?: RuntimeDefinition;
  files?: string[];
};

/**
 * Aspect allows to extend Bit in one or more runtime environments.
 */
export class Aspect {
  constructor(
    readonly id: string,
    readonly dependencies: Aspect[],
    readonly slots: SlotProvider<unknown>[],
    readonly defaultConfig = {},
    readonly files: string[] = []
  ) {}

  private _runtimes: RuntimeManifest<unknown>[] = [];

  addRuntime<T>(runtimeManifest: RuntimeManifest<T>) {
    this._runtimes.push(runtimeManifest);
    return this;
  }

  getRuntime(runtimeName: string): undefined | RuntimeManifest<unknown> {
    return this._runtimes.find((runtime) => {
      return runtime.runtime.name === runtimeName;
    });
  }

  static create(manifest: AspectManifest) {
    return new Aspect(
      manifest.id,
      manifest.dependencies || [],
      manifest.slots || [],
      manifest.defaultConfig,
      manifest.files || []
    );
  }
}
