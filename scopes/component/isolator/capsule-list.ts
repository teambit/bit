import type { Component, ComponentID } from '@teambit/component';
import { Dependency, DependencyResolverMain } from '@teambit/dependency-resolver';
import { Edge, Graph, Node } from '@teambit/graph.cleargraph';
import { BitId } from '@teambit/legacy-bit-id';
import { normalize } from 'path';
import { Capsule } from './capsule';

export default class CapsuleList extends Array<Capsule> {
  getCapsule(id: ComponentID): Capsule | undefined {
    return this.find((capsule) => capsule.component.id.isEqual(id));
  }
  getCapsuleByLegacyId(id: BitId): Capsule | undefined {
    return this.find((capsule) => capsule.component.id._legacy.isEqual(id));
  }
  getCapsuleIgnoreVersion(id: ComponentID): Capsule | undefined {
    return this.find((capsule) => capsule.component.id.isEqual(id, { ignoreVersion: true }));
  }
  getCapsuleIgnoreScopeAndVersion(id: ComponentID): Capsule | undefined {
    return this.find((capsule) => capsule.component.id._legacy.isEqualWithoutScopeAndVersion(id._legacy));
  }
  getAllCapsuleDirs(): string[] {
    return this.map((capsule) => capsule.path);
  }
  getIdByPathInCapsule(pathInCapsule: string): ComponentID | null {
    const normalizedPathInCapsule = normalize(pathInCapsule);
    const found = this.find((capsule) => normalizedPathInCapsule === normalize(capsule.path));
    return found ? found.component.id : null;
  }
  getAllComponents(): Component[] {
    return this.map((c) => c.component);
  }
  // Sort the capsules by their dependencies. The capsules with no dependencies will be first. Returns a new array.
  async toposort(depResolver: DependencyResolverMain): Promise<CapsuleList> {
    const components = this.getAllComponents();
    const graph = new Graph<Component, string>();

    // Build a graph with all the components from the current capsule list
    components.forEach((comp: Component) => graph.setNode(new Node(depResolver.getPackageName(comp), comp)));

    // Add edges between the components according to their interdependencies
    for (const node of graph.nodes) {
      // eslint-disable-next-line no-await-in-loop
      const deps = await depResolver.getDependencies(node.attr);
      deps.forEach((dep: Dependency) => {
        const depPkgName = dep.getPackageName?.();
        if (depPkgName && graph.hasNode(depPkgName)) {
          graph.setEdge(new Edge(node.id, depPkgName, dep.lifecycle));
        }
      });
    }

    const sortedSeeders = graph.toposort(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const sortedCapsules: Capsule[] = sortedSeeders.map((node: Node<Component>) => this.getCapsule(node.attr.id)!);
    return CapsuleList.fromArray(sortedCapsules);
  }
  static fromArray(capsules: Capsule[]) {
    return new CapsuleList(...capsules);
  }
  /**
   * determines whether or not a capsule can theoretically use the dists saved in the last snap, rather than re-compile them.
   * practically, this optimization is used for components that have typescript as their compiler.
   */
  static async capsuleUsePreviouslySavedDists(component: Component): Promise<boolean> {
    const isModified = await component.isModified();
    return component.buildStatus === 'succeed' && !isModified;
  }
}
