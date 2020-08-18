import { RuntimeDefinition } from './runtime-definition';
import DependencyGraph from '../extension-graph/extension-graph';
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

  static async load(graph: DependencyGraph) {
    const runtimes: { [key: string]: RuntimeDefinition } = {};

    graph.extensions.forEach((manifest) => {
      if (!manifest.declareRuntime) return;
      runtimes[manifest.declareRuntime.name] = manifest.declareRuntime;
    });

    return new Runtimes(runtimes);
  }
}
