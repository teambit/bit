import path from 'path';
import fs from 'fs-extra';
import { expect, use } from 'chai';
import { APISchema, UnknownSchema } from '@teambit/semantics.entities.semantic-schema';
import { computeAPIDiff } from '@teambit/semantics.entities.semantic-schema-diff';
import type { APIDiffResult } from '@teambit/semantics.entities.semantic-schema-diff';
import chaiSubset from 'chai-subset';
import type { TrackerMain } from '@teambit/tracker';
import { TrackerAspect } from '@teambit/tracker';
import { loadAspect, loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { ComponentID } from '@teambit/component-id';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { SchemaMain } from './schema.main.runtime';
import { SchemaAspect } from './schema.aspect';

use(chaiSubset);

describe('SchemaAspect', function () {
  this.timeout(0);
  let schema: SchemaMain;
  let workspace: Workspace;
  let workspaceData: WorkspaceData;
  before(async () => {
    workspaceData = mockWorkspace();
    const { workspacePath } = workspaceData;
    // eslint-disable-next-line no-console
    console.log('workspace created at ', workspacePath);
    schema = await loadAspect(SchemaAspect, workspacePath);
  });
  after(async () => {
    await destroyWorkspace(workspaceData);
  });
  describe('getSchema()', () => {
    let apiSchema: APISchema;
    before(async () => {
      const { workspacePath } = workspaceData;
      const compDir = path.join(workspacePath, 'button');
      const src = path.join(getMockDir(), 'button');
      await fs.copy(src, compDir);
      const harmony = await loadManyAspects([WorkspaceAspect, SchemaAspect, TrackerAspect], workspacePath);
      workspace = harmony.get<Workspace>(WorkspaceAspect.id);
      const tracker = harmony.get<TrackerMain>(TrackerAspect.id);
      await tracker.track({ rootDir: compDir, defaultScope: 'org.scope' });
      await workspace.bitMap.write();
      schema = harmony.get<SchemaMain>(SchemaAspect.id);
      const compId = await workspace.resolveComponentId('button');
      const comp = await workspace.get(compId);
      apiSchema = await schema.getSchema(comp, true);
    });
    it('should be able to generate JSON object with all schemas', async () => {
      const results = apiSchema.toObject();
      const expectedJsonPath = path.join(getMockDir(), 'button-schemas.json');
      // uncomment the next line temporarily to sync the expected json with new schema changes
      // fs.outputFileSync(expectedJsonPath, JSON.stringify(results, undefined, 2));
      const expectedJson = fs.readJsonSync(expectedJsonPath);
      expect(results).to.to.containSubset(expectedJson);
    });
  });
  describe('getSchemaFromObject', () => {
    it('should be able to deserialize an JSON object to SchemaNode instances', () => {
      const jsonPath = path.join(getMockDir(), 'button-schemas.json');
      const json = fs.readJsonSync(jsonPath);
      const apiSchema = schema.getSchemaFromObject(json);
      expect(apiSchema instanceof APISchema).to.be.true;
      expect(apiSchema.componentId.constructor.name).to.equal(ComponentID.name);
      expect(apiSchema.toObject()).to.containSubset(json);
    });
    it('should not throw when it does not recognize the schema', () => {
      const jsonPath = path.join(getMockDir(), 'button-old-schema.json');
      const json = fs.readJsonSync(jsonPath);
      const apiSchema = schema.getSchemaFromObject(json);
      expect(apiSchema instanceof APISchema).to.be.true;
      expect(apiSchema.module.exports[0] instanceof UnknownSchema).to.be.true;
      expect(apiSchema.module.exports[0].location).to.deep.equal({ file: 'index.ts', line: 21, character: 14 });
    });
  });
  describe('schema diff', () => {
    let diffResult: APIDiffResult;

    before(async () => {
      // Use v1 schema from the golden file (already validated by getSchema test)
      const v1JsonPath = path.join(getMockDir(), 'button-schemas.json');
      const v1Json = fs.readJsonSync(v1JsonPath);
      const baseSchema = schema.getSchemaFromObject(v1Json);

      // Extract v2 schema from the button-v2 fixture
      const { workspacePath } = workspaceData;
      const compDirV2 = path.join(workspacePath, 'button-v2');
      const srcV2 = path.join(getMockDir(), 'button-v2');
      await fs.copy(srcV2, compDirV2);
      const harmony = await loadManyAspects([WorkspaceAspect, SchemaAspect, TrackerAspect], workspacePath);
      const ws = harmony.get<Workspace>(WorkspaceAspect.id);
      const tracker = harmony.get<TrackerMain>(TrackerAspect.id);
      await tracker.track({ rootDir: compDirV2, defaultScope: 'org.scope' });
      await ws.bitMap.write();
      const schemaMain = harmony.get<SchemaMain>(SchemaAspect.id);
      const compIdV2 = await ws.resolveComponentId('button-v2');
      const compV2 = await ws.get(compIdV2);
      const compareSchema = await schemaMain.getSchema(compV2, true);

      // Compute diff using impact assessor from the aspect
      const assessor = schemaMain.getImpactAssessor();
      diffResult = computeAPIDiff(baseSchema, compareSchema, assessor);
    });

    it('should produce a diff result matching the golden file', () => {
      const result = serializeDiffResult(diffResult);
      const expectedJsonPath = path.join(getMockDir(), 'button-diff.json');
      // uncomment the next line temporarily to sync the expected json with new diff changes
      // fs.outputFileSync(expectedJsonPath, JSON.stringify(result, undefined, 2));
      const expectedJson = fs.readJsonSync(expectedJsonPath);
      expect(result).to.containSubset(expectedJson);
    });

    it('should detect changes', () => {
      expect(diffResult.hasChanges).to.be.true;
    });

    it('should detect added exports', () => {
      expect(diffResult.added).to.be.greaterThan(0);
      const addedNames = diffResult.changes.filter((c) => c.status === 'ADDED').map((c) => c.exportName);
      expect(addedNames).to.include('newUtility');
    });

    it('should detect modified exports', () => {
      expect(diffResult.modified).to.be.greaterThan(0);
    });

    it('should correctly assess impact of non-breaking additions', () => {
      const added = diffResult.changes.find((c) => c.exportName === 'newUtility');
      expect(added?.impact).to.equal('NON_BREAKING');
    });
  });
});

/**
 * Serialize a diff result for golden file comparison.
 * Strips raw schema nodes (baseNode/compareNode) since they're large and tested separately.
 */
function serializeDiffResult(diff: APIDiffResult): Record<string, any> {
  const serializeChange = (change: any) => ({
    status: change.status,
    visibility: change.visibility,
    impact: change.impact,
    exportName: change.exportName,
    schemaType: change.schemaType,
    ...(change.baseSignature ? { baseSignature: change.baseSignature } : {}),
    ...(change.compareSignature ? { compareSignature: change.compareSignature } : {}),
    ...(change.changes && change.changes.length > 0
      ? {
          details: change.changes.map((d: any) => ({
            changeKind: d.changeKind,
            description: d.description,
            impact: d.impact,
            ...(d.from !== undefined ? { from: d.from } : {}),
            ...(d.to !== undefined ? { to: d.to } : {}),
          })),
        }
      : {}),
  });

  return {
    hasChanges: diff.hasChanges,
    impact: diff.impact,
    added: diff.added,
    removed: diff.removed,
    modified: diff.modified,
    breaking: diff.breaking,
    nonBreaking: diff.nonBreaking,
    patch: diff.patch,
    publicChanges: diff.publicChanges.map(serializeChange),
    internalChanges: diff.internalChanges.map(serializeChange),
  };
}

function getCurrentDir() {
  const currentDir = __dirname;
  if (currentDir.endsWith(`${path.sep}dist`)) return currentDir.slice(0, -5);
  return currentDir;
}

function getMockDir() {
  return path.join(getCurrentDir(), 'mock');
}
