import Container from './container';
import Extension from './extension';
import { Graph } from '../graph';
import { ExtensionProvider, ProviderFn } from './extension.provider';
import DependencyGraph from './dependency-graph/dependency-graph';
import { AnyExtension } from './types';

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

export default class Harmony {
  constructor(private graph: DependencyGraph) {}

  register(extension: Extension) {
    // container.register(extension.name, { useValue: extension });
  }

  // resolve<T extends Extension>(token: string): T {
  // const instance = container.resolve<T>(token);
  // return instance;
  // }

  get extensions() {
    return this.graph.vertices.map(vertex => vertex.attr);
  }

  async runOne(extension: AnyExtension) {
    // create an index of all vertices in dependency graph
    const dependencies = await Promise.all(
      extension.dependencies.map(async (ext: AnyExtension) => {
        return ext.instance;
      })
    );

    await extension.run(dependencies);
  }

  async run() {
    const executionOrder = this.graph.byExecutionOrder();
    await asyncForEach(executionOrder, async ext => {
      await this.runOne(ext);
    });
  }

  static load(extension: Extension<any, any>) {
    return new Harmony(DependencyGraph.fromRoot(extension));
  }
}
