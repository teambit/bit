import Container from './container';
import Extension from './extension';
import { Graph } from '../graph';
import { ExtensionProvider, ProviderFn } from './extension.provider';
import DependencyGraph from './dependency-graph/dependency-graph';
import { AnyExtension } from './types';

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
    const dependencies = extension.dependencies.map((ext: AnyExtension) => {
      return this.graph.getExtension(ext.name);
    });

    return extension.run(dependencies);
  }

  async run() {
    const executionOrder = this.graph.byExecutionOrder();
    executionOrder.forEach(async ext => this.runOne(ext));
  }

  static load(extension: Extension<any, any>) {
    return new Harmony(DependencyGraph.fromRoot(extension));
  }
}
