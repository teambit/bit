import { Graph, Edge as GraphEdge } from '@teambit/graph.cleargraph';
import { fromExtension, fromExtensions } from './from-extension';
import { ExtensionManifest, Extension } from '../extension';
import { RuntimeDefinition, Runtimes } from '../runtimes';
import { RequireFn } from '../harmony';

export type DependencyGraphOptions = {
  getName?: (manifest: any) => string;
};

function getName(manifest: any) {
  return Reflect.getMetadata('harmony:name', manifest) || manifest.id || manifest.name;
}

export type Edge = {
  type: string;
  runtime?: string;
};

export default class DependencyGraph extends Graph<Extension, Edge> {
  private cache = new Map<string, Extension>();

  getRuntimeDependencies(
    aspect: Extension,
    runtime: RuntimeDefinition,
    options: DependencyGraphOptions = {}
  ): Extension[] {
    const dependencies = this.successorMap(aspect.name);
    const edgeFilter = (edge: GraphEdge<Edge>) => {
      if (!edge.attr.runtime) return false;
      return edge.attr.runtime === runtime.name;
    };
    const runtimeDeps = this.successorMap(aspect.name, { edgeFilter });
    const runtimeManifest = aspect.getRuntime(runtime);
    if (!runtimeManifest) return Array.from(dependencies.values()).map((d) => d.attr);
    if (runtimeDeps && runtimeDeps.size) {
      return this.sortDeps(
        runtimeManifest.dependencies,
        Array.from(runtimeDeps.values()).map((d) => d.attr),
        options
      );
    }
    return this.sortDeps(
      runtimeManifest.dependencies,
      Array.from(dependencies.values()).map((d) => d.attr),
      options
    );
  }

  private sortDeps(originalDependencies: any[], targetDependencies: any[], options: DependencyGraphOptions = {}) {
    const _originalDependencies = options.getName
      ? originalDependencies?.map((aspect) => {
          if (!options.getName) return aspect;
          aspect.id = options.getName(aspect);
          return aspect;
        }) || []
      : originalDependencies;

    return targetDependencies.sort((a, b) => {
      return (
        _originalDependencies.findIndex((item) => item.id === a.id) -
        _originalDependencies.findIndex((item) => item.id === b.id)
      );
    });
  }

  byExecutionOrder() {
    return this.toposort(true);
  }

  private async enrichRuntimeExtension(
    id: string,
    aspect: Extension,
    runtime: RuntimeDefinition,
    runtimes: Runtimes,
    requireFn: RequireFn,
    options: DependencyGraphOptions = {}
  ) {
    await requireFn(aspect, runtime);
    const runtimeManifest = aspect.getRuntime(runtime);
    if (!runtimeManifest) return;
    const deps = runtimeManifest.dependencies;
    if (!deps) return;
    const promises = deps.map(async (dep: any) => {
      const depId = options.getName ? options.getName(dep) : dep.id;
      if (!this.hasNode(depId)) {
        this.add(dep);
        if (dep.declareRuntime) {
          runtimes.add(dep.declareRuntime);
        }

        const node = this.get(depId);
        if (!node) return;
        await requireFn(node, runtime);
        await this.enrichRuntimeExtension(depId, this.get(depId)!, runtime, runtimes, requireFn);
      }

      this.setEdge(
        new GraphEdge(id, depId, {
          runtime: runtime.name,
          type: 'runtime-dependency',
        })
      );
    });

    await Promise.all(promises);
  }

  async enrichRuntime(
    runtime: RuntimeDefinition,
    runtimes: Runtimes,
    requireFn: RequireFn,
    options: DependencyGraphOptions = {}
  ) {
    const promises = this.nodes
      .map((n) => n.attr)
      .map(async (extension) => {
        return this.enrichRuntimeExtension(extension.id, extension, runtime, runtimes, requireFn, options);
      });

    return Promise.all(promises);
  }

  add(manifest: ExtensionManifest) {
    const { vertices, edges } = fromExtension(manifest);
    this.setNodes(vertices);
    this.setEdges(edges);

    return this;
  }

  load(extensions: ExtensionManifest[]) {
    const newExtensions = extensions.filter((extension) => {
      if (!extension.id) return false;
      return !this.get(extension.id);
    });
    const { vertices, edges } = fromExtensions(newExtensions);
    // Only set new vertices
    this.setNodes(vertices, false); // false because we don't want to override already-loaded extensions
    this.setEdges(edges);

    return this;
  }

  // :TODO refactor this asap
  getExtension(manifest: ExtensionManifest) {
    const id = getName(manifest);
    const cachedVertex = this.cache.get(id);
    if (cachedVertex) return cachedVertex;

    const res = this.node(id)?.attr;
    if (res) {
      this.cache.set(res.name, res);
      return res;
    }

    return null;
  }

  get extensions(): ExtensionManifest[] {
    return Array.from(this.nodes.map((n) => n.attr));
  }

  get aspects() {
    return this.extensions;
  }

  get(id: string): Extension | null {
    const cachedVertex = this.cache.get(id);
    if (cachedVertex) return cachedVertex;

    const res = this.node(id)?.attr;
    if (res) {
      this.cache.set(res.name, res);
      return res;
    }

    return null;
  }

  /**
   * build Harmony from a single extension.
   */
  static fromRoot(extension: ExtensionManifest) {
    const { vertices, edges } = fromExtension(extension);

    return new DependencyGraph(vertices, edges);
  }

  /**
   * build Harmony from set of extensions
   */
  static from(extensions: ExtensionManifest[], options: DependencyGraphOptions = {}) {
    const { vertices, edges } = fromExtensions(extensions, options);

    return new DependencyGraph(vertices, edges);
  }
}
