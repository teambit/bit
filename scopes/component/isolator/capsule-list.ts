import type { Component, ComponentID } from '@teambit/component';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
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

    components.forEach((comp) => graph.setNode(new Node(comp.id.toString(), comp)));

    for (const comp of components) {
      // eslint-disable-next-line no-await-in-loop
      const deps = await depResolver.getComponentDependencies(comp);
      deps.forEach((dep) => {
        const depCompId = dep.componentId;
        if (graph.hasNode(depCompId.toString())) {
          graph.setEdge(new Edge(comp.id.toString(), depCompId.toString(), dep.lifecycle));
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
}
