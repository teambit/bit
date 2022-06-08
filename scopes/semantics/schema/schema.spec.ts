import path from 'path';
import fs from 'fs-extra';
import { APISchema } from '@teambit/semantics.entities.semantic-schema';
import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import { mockWorkspace, destroyWorkspace, WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { ComponentID } from '@teambit/component-id';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { SchemaMain } from './schema.main.runtime';
import { SchemaAspect } from '.';
import { UnknownSchema } from '@teambit/semantics.entities.semantic-schema';

describe('SchemaAspect', function () {
  let schema: SchemaMain;
  let workspace: Workspace;
  let workspaceData: WorkspaceData;
  beforeAll(async () => {
    workspaceData = mockWorkspace();
    const { workspacePath } = workspaceData;
    // eslint-disable-next-line no-console
    console.log('workspace created at ', workspacePath);
    schema = await loadAspect(SchemaAspect, workspacePath);
  });
  afterAll(async () => {
    await destroyWorkspace(workspaceData);
  });
  describe('getSchema()', () => {
    let apiSchema: APISchema;
    beforeAll(async () => {
      const { workspacePath } = workspaceData;
      const compDir = path.join(workspacePath, 'button');
      const src = path.join(getMockDir(), 'button');
      await fs.copy(src, compDir);
      workspace = await loadAspect(WorkspaceAspect, workspacePath);
      await workspace.track({ rootDir: compDir, defaultScope: 'org.scope' });
      await workspace.bitMap.write();
      schema = await loadAspect(SchemaAspect, workspacePath);
      const compId = await workspace.resolveComponentId('button');
      const comp = await workspace.get(compId);
      apiSchema = await schema.getSchema(comp);
    });
    it('should be able to generate JSON object with all schemas', async () => {
      const results = apiSchema.toObject();
      const expectedJsonPath = path.join(getMockDir(), 'button-schemas.json');
      // uncomment the next line temporarily to sync the expected json with new schema changes
      // fs.outputFileSync(expectedJsonPath, JSON.stringify(results, undefined, 2));
      const expectedJson = fs.readJsonSync(expectedJsonPath);
      // @ts-ignore it exists on Jest. for some reason ts assumes this is Jasmine.
      expect(results).toMatchObject(expectedJson);
    });
  });
  describe('getSchemaFromObject', () => {
    it('should be able to deserialize an JSON object to SchemaNode instances', () => {
      const jsonPath = path.join(getMockDir(), 'button-schemas.json');
      const json = fs.readJsonSync(jsonPath);
      const apiSchema = schema.getSchemaFromObject(json);
      expect(apiSchema instanceof APISchema).toBeTruthy();
      expect(apiSchema.componentId instanceof ComponentID).toBeTruthy();
      // @ts-ignore it exists on Jest. for some reason ts assumes this is Jasmine.
      expect(apiSchema.toObject()).toMatchObject(json);
    });
    it('should not throw when it does not recognize the schema', () => {
      const jsonPath = path.join(getMockDir(), 'button-old-schema.json');
      const json = fs.readJsonSync(jsonPath);
      const apiSchema = schema.getSchemaFromObject(json);
      expect(apiSchema instanceof APISchema).toBeTruthy();
      expect(apiSchema.module.exports[0] instanceof UnknownSchema).toBeTruthy();
      // @ts-ignore
      expect(apiSchema.module.exports[0].location).toMatchObject({ file: 'index.ts', line: 21, character: 14 });
    });
  });
});

function getCurrentDir() {
  const currentDir = __dirname;
  if (currentDir.endsWith(`${path.sep}dist`)) return currentDir.slice(0, -5);
  return currentDir;
}

function getMockDir() {
  return path.join(getCurrentDir(), 'mock');
}
