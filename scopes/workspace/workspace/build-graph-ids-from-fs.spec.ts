import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { ComponentLoader } from '@teambit/legacy.consumer-component';
import { GraphIdsFromFsBuilder } from './build-graph-ids-from-fs';

describe('GraphIdsFromFsBuilder', () => {
  const originalScope = ComponentLoader.runDependencyLoadScope;
  let active = 0;
  let scopes = 0;

  beforeEach(() => {
    active = 0;
    scopes = 0;
    ComponentLoader.runDependencyLoadScope = async (operation) => {
      scopes++;
      active++;
      try {
        return await operation();
      } finally {
        active--;
      }
    };
  });

  afterEach(() => {
    ComponentLoader.runDependencyLoadScope = originalScope;
  });

  function builder(ids: string[], get: (id: ComponentID) => Promise<any>) {
    const workspace = {
      consumer: { scope: { scopeImporter: { importMany: async () => undefined } } },
      listIds: () => [],
      getCurrentLaneObject: async () => undefined,
      getSavedGraphOfComponentIfExist: async () => undefined,
      get,
    };
    const logger = { debug: () => undefined, warn: () => undefined, error: () => undefined };
    const dependencyResolver = {
      // each seeder depends on the next one, so dependencies are loaded in later rounds
      getComponentDependencies: (component) => {
        const next = ids[ids.indexOf(component.id.toString()) + 1];
        return next ? [{ componentId: ComponentID.fromString(next), lifecycle: 'runtime' }] : [];
      },
    };
    return new GraphIdsFromFsBuilder(workspace as any, logger as any, dependencyResolver as any);
  }

  it('loads every component of the graph within a single dependency-load operation', async () => {
    const ids = ['scope/a@1.0.0', 'scope/b@1.0.0', 'scope/c@1.0.0'];
    const loadedInScope: boolean[] = [];
    const graph = await builder(ids, async (id) => {
      loadedInScope.push(active === 1);
      return { id };
    }).buildGraph([ComponentID.fromString(ids[0])]);

    expect(scopes).to.equal(1);
    expect(loadedInScope).to.deep.equal([true, true, true]);
    expect(graph.nodes.map((node) => node.id)).to.deep.equal(ids);
    expect(graph.edges).to.have.lengthOf(2);
  });

  it('closes the operation when loading fails', async () => {
    const failure = new Error('load failed');
    let error: unknown;
    try {
      await builder(['scope/a@1.0.0'], async () => {
        throw failure;
      }).buildGraph([ComponentID.fromString('scope/a@1.0.0')]);
    } catch (err) {
      error = err;
    }
    expect(error).to.equal(failure);
    expect(scopes).to.equal(1);
    expect(active).to.equal(0);
  });
});
