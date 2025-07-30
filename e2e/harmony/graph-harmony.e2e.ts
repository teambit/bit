import chai, { expect } from 'chai';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import { loadBit } from '@teambit/bit';
import { Helper } from '@teambit/legacy.e2e-helper';
import type { IdGraph } from '@teambit/objects';
import { ModelComponent, Version, objectListToGraph } from '@teambit/objects';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('graph aspect', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('tag a few components', () => {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
    });
    describe('ask the graph aspect for the graph ids', () => {
      let graph: IdGraph;
      before(async () => {
        const harmony = await loadBit(helper.scopes.localPath);
        const scope = harmony.get<ScopeMain>(ScopeAspect.id);
        // @ts-ignore
        const objectList = await scope.toObjectList([ModelComponent, Version]);
        graph = await objectListToGraph(objectList);
      });
      it('should include the dependencies correctly', () => {
        const jsonGraph = graph.toJson();
        expect(jsonGraph.nodes).to.have.lengthOf(3);
        expect(jsonGraph.edges).to.have.lengthOf(2);
        const edges = jsonGraph.edges.map((edge) => ({ sourceId: edge.sourceId, targetId: edge.targetId }));
        expect(edges).to.include.deep.members([
          { sourceId: `${helper.scopes.remote}/comp1@0.0.1`, targetId: `${helper.scopes.remote}/comp2@0.0.1` },
          { sourceId: `${helper.scopes.remote}/comp2@0.0.1`, targetId: `${helper.scopes.remote}/comp3@0.0.1` },
        ]);
      });
    });
  });
});
