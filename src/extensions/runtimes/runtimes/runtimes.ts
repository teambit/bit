import { AspectGraph } from '@teambit/harmony';
import { RuntimeDefinition } from './runtime-definition';
import { RuntimeNotDefined } from './exceptions';

export class Runtimes {
  constructor(readonly runtimeDefinition: { [key: string]: RuntimeDefinition }) {}

  add(runtime: RuntimeDefinition) {
    this.runtimeDefinition[runtime.name] = runtime;
    return this;
  }

  get(name: string): RuntimeDefinition {
    const runtime = this.runtimeDefinition[name];
    if (!runtime) throw new RuntimeNotDefined(name);
    return this.runtimeDefinition[name];
  }

  dispose() {}

  static async load(graph: AspectGraph) {
    const runtimes: { [key: string]: RuntimeDefinition } = {};

    graph.extensions.forEach((extension) => {
      const manifest = extension.manifest;
      if (!manifest.declareRuntime) return;
      runtimes[manifest.declareRuntime.name] = manifest.declareRuntime;
    });

    return new Runtimes(runtimes);
  }
}
