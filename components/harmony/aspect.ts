import { SlotProvider } from './slots';
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

export class Aspect {
  constructor(
    public id: string,
    public dependencies: Aspect[],
    readonly slots: SlotProvider<unknown>[],
    readonly defaultConfig = {},
    readonly declareRuntime: RuntimeDefinition | undefined,
    readonly files: string[]
  ) {}

  private _runtimes: RuntimeManifest[] = [];

  addRuntime(runtimeManifest: RuntimeManifest) {
    this._runtimes.push(runtimeManifest);
    return this;
  }

  getRuntime(runtimeDef: RuntimeDefinition): undefined | RuntimeManifest {
    return this._runtimes.find((runtime) => {
      if (typeof runtime.runtime === 'string') return runtime.runtime === runtimeDef.name;
      return runtime.runtime.name === runtimeDef.name;
    });
  }

  getRuntimes(): RuntimeManifest[] {
    return this._runtimes;
  }

  static create(manifest: AspectManifest) {
    return new Aspect(
      manifest.id,
      manifest.dependencies || [],
      manifest.slots || [],
      manifest.defaultConfig,
      manifest.declareRuntime,
      manifest.files || []
    );
  }
}
