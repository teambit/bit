import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { DepEdge } from '@teambit/objects';
import { FlattenedEdgesGetter } from './flattened-edges';

type Fake = ConsumerComponent & { flattenedDependencies: any; flattenedEdges: DepEdge[] };

const id = (name: string) => ComponentID.fromString(`my-scope/${name}@0.0.1`);
const deps = (ids: ComponentID[]) => ({ get: () => ids.map((depId) => ({ id: depId })) });
const edge = (source: string, target: string, type: DepEdge['type'] = 'prod'): DepEdge => ({
  source: id(source),
  target: id(target),
  type,
});

/**
 * a component that is being snapped. `prevEdges` are the flattened edges of its previous version, which the getter
 * loads through `modelComponent.loadVersion()`.
 */
function fakeComponent(name: string, prod: string[], dev: string[] = [], prevEdges?: DepEdge[]): Fake {
  const previousVersion = prevEdges
    ? {
        getFlattenedEdges: async () => prevEdges,
        loadFlattenedDependencies: async () => prevEdges.map((e) => e.target),
      }
    : undefined;
  return {
    id: id(name),
    dependencies: deps(prod.map(id)),
    devDependencies: deps(dev.map(id)),
    extensionDependencies: deps([]),
    previouslyUsedVersion: prevEdges ? '0.0.1' : undefined,
    modelComponent: previousVersion ? { loadVersion: async () => previousVersion } : undefined,
  } as unknown as Fake;
}

const fakeScope = { legacyScope: { objects: {} } } as any;
const fakeLogger = { debug: () => {}, warn: () => {} } as any;

const idsOf = (list: { map: (fn: (id: ComponentID) => string) => string[] }) => list.map((i) => i.toString());
const edgesOf = (edges: DepEdge[]) => edges.map((e) => `${e.source.name}->${e.target.name}:${e.type}`);

describe('FlattenedEdgesGetter', () => {
  describe('all dependencies are in the snapped components', () => {
    // a -> b (prod), a -> c (dev), b -> d, c -> d, d -> b (a cycle)
    let a: Fake;
    before(async () => {
      a = fakeComponent('a', ['b'], ['c']);
      const b = fakeComponent('b', ['d']);
      const c = fakeComponent('c', ['d']);
      const d = fakeComponent('d', ['b']);
      const getter = new FlattenedEdgesGetter(fakeScope, [a, b, c, d], fakeLogger);
      await getter.buildGraph();
      [a, b, c, d].forEach((comp) => getter.populateFlattenedAndEdgesForComp(comp));
    });
    it('should list every reachable dependency once, in depth-first order, without the component itself', () => {
      expect(idsOf(a.flattenedDependencies)).to.deep.equal([
        'my-scope/b@0.0.1',
        'my-scope/d@0.0.1',
        'my-scope/c@0.0.1',
      ]);
    });
    it('should list every edge between the reachable nodes once, in the order the walk meets them', () => {
      expect(edgesOf(a.flattenedEdges)).to.deep.equal(['a->b:prod', 'b->d:prod', 'd->b:prod', 'a->c:dev', 'c->d:prod']);
    });
  });

  describe('dependencies that are not snapped, found in the flattened edges of previous versions', () => {
    // x and y both depend on b, which is not snapped. the previous version of each holds b -> c.
    let x: Fake;
    let y: Fake;
    before(async () => {
      x = fakeComponent('x', ['b'], [], [edge('x', 'b'), edge('b', 'c')]);
      y = fakeComponent('y', ['b'], [], [edge('y', 'b'), edge('b', 'c'), edge('c', 'e')]);
      const getter = new FlattenedEdgesGetter(fakeScope, [x, y], fakeLogger);
      await getter.buildGraph();
      [x, y].forEach((comp) => getter.populateFlattenedAndEdgesForComp(comp));
    });
    it('should give each component the dependencies reachable through the previous edges', () => {
      expect(idsOf(x.flattenedDependencies)).to.deep.equal([
        'my-scope/b@0.0.1',
        'my-scope/c@0.0.1',
        'my-scope/e@0.0.1',
      ]);
      expect(idsOf(y.flattenedDependencies)).to.deep.equal([
        'my-scope/b@0.0.1',
        'my-scope/c@0.0.1',
        'my-scope/e@0.0.1',
      ]);
    });
    it('should not lose an edge of a node that a second previous version lists again', () => {
      expect(edgesOf(x.flattenedEdges)).to.include('c->e:prod');
      expect(edgesOf(y.flattenedEdges)).to.deep.equal(['y->b:prod', 'b->c:prod', 'c->e:prod']);
    });
  });
});
