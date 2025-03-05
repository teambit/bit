import chai, { expect } from 'chai';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import { WorkspaceAspect } from '@teambit/workspace';
import { mockWorkspace, destroyWorkspace, WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { GraphqlAspect } from './graphql.aspect';
import { GraphqlMain } from './graphql.main.runtime';
import { LanesAspect } from '@teambit/lanes';

chai.use(require('chai-fs'));

describe('GraphQL Aspect', function () {
  this.timeout(0);

  describe('getSchemas and getSchema APIs', () => {
    let graphql: GraphqlMain;
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      const harmony = await loadManyAspects([WorkspaceAspect, GraphqlAspect, LanesAspect], workspacePath);
      graphql = harmony.get<GraphqlMain>(GraphqlAspect.id);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should bring the schemas when calling getSchemas API', async () => {
      const schemas = graphql.getSchemas([LanesAspect.id]);
      expect(schemas).to.be.an('array');
      expect(schemas).to.have.lengthOf(1);
      expect(schemas[0]).to.be.an('object');
      expect(schemas[0]).to.not.be.an('function');
    });
    it('should bring the schemas when calling getSchema API', async () => {
      const schema = graphql.getSchema(LanesAspect.id);
      expect(schema).to.be.an('object');
      expect(schema).to.not.be.an('function');
    });
  });
});
