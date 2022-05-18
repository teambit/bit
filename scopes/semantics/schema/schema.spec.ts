import path from 'path';
import fs from 'fs-extra';
import { APISchema } from '@teambit/semantics.entities.semantic-schema';
import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import { mockWorkspace, destroyWorkspace, WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { SchemaMain } from './schema.main.runtime';
import { SchemaAspect } from '.';

describe('SchemaAspect', function () {
  let schema: SchemaMain;
  let workspace: Workspace;
  let workspaceData: WorkspaceData;
  beforeAll(async () => {
    workspaceData = mockWorkspace();
  });
  afterAll(async () => {
    await destroyWorkspace(workspaceData);
  });
  describe('getSchema()', () => {
    let apiSchema: APISchema;
    beforeAll(async () => {
      const { workspacePath } = workspaceData;
      // eslint-disable-next-line no-console
      console.log('workspace created at ', workspacePath);
      const compDir = path.join(workspacePath, 'button');
      const src = path.join(__dirname, 'mock', 'button');
      await fs.copy(src, compDir);
      workspace = await loadAspect(WorkspaceAspect, workspacePath);
      await workspace.track({ rootDir: compDir });
      await workspace.bitMap.write();
      schema = await loadAspect(SchemaAspect, workspacePath);
      const compId = await workspace.resolveComponentId('button');
      const comp = await workspace.get(compId);
      apiSchema = await schema.getSchema(comp);
    });
    it('should be able to generate JSON object with all schemas', async () => {
      const results = apiSchema.toObject();
      const expectedJsonPath = path.join(__dirname, 'mock', 'button-schemas.json');
      // uncomment the next line temporarily to sync the expected json with new schema changes
      // fs.outputFileSync(expectedJsonPath, JSON.stringify(results, undefined, 2));
      const expectedJson = fs.readJsonSync(expectedJsonPath);
      expect(results).toMatchObject(expectedJson);
    });
  });
});
