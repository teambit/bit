import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { ComponentID } from '@teambit/component-id';
import { healMissingMainFiles } from './heal-missing-main-files';

const ID_STR = 'teambit.api-reference/renderers/schema-node-member-summary';
/** A version this repository never installed: an orphaned tag whose Version object is not on the fs. */
const STALE_VERSION = '0.0.0-75238957ce4bc43dee7758156dde5bc3a343e70d';
const SCOPE_HEAD = '0.0.85';

/**
 * A workspace on disk whose `.bitmap` entry points at `dist/index.d.ts` while only `index.ts`
 * exists — the shape the main-scope reconciler hits after the scope moves a component's main file
 * back to source.
 */
function workspaceOnDisk(): { wsPath: string; rootDir: string } {
  const wsPath = fs.mkdtempSync(path.join(os.tmpdir(), 'heal-main-file-'));
  const rootDir = 'components/renderers/schema-node-member-summary';
  fs.outputFileSync(path.join(wsPath, rootDir, 'index.ts'), 'export {};\n');
  return { wsPath, rootDir };
}

/**
 * Real heal code over stubbed deps. `getModelComponentIfExist` reproduces the behaviour that caused
 * the bug: `sources.get` is version-sensitive, so an id carrying a version whose Version object is
 * absent from the filesystem resolves to `undefined`, while the same id without a version resolves
 * to the component. `lookedUp` records every id the heal asked for.
 */
function stubWorkspace(wsPath: string, rootDir: string, headMainFile: string | undefined) {
  const id = ComponentID.fromString(`${ID_STR}@${STALE_VERSION}`);
  const componentMap: any = { id, mainFile: 'dist/index.d.ts', rootDir };
  const lookedUp: string[] = [];
  const written: string[] = [];
  const removed: string[] = [];

  const modelComponent = {
    getHeadRegardlessOfLaneAsTagOrHash: () => SCOPE_HEAD,
    loadVersion: async () => (headMainFile ? { mainFile: headMainFile } : undefined),
  };

  const workspace: any = {
    path: wsPath,
    consumer: {
      bitMap: {
        components: [componentMap],
        markAsChanged: () => written.push('markAsChanged'),
        removeComponent: (compId: ComponentID) => removed.push(compId.toString()),
        write: async () => written.push('write'),
      },
    },
    scope: {
      legacyScope: {
        objects: {},
        scopeImporter: { importWithoutDeps: async () => undefined },
        getModelComponentIfExist: async (asked: ComponentID) => {
          lookedUp.push(asked.toString());
          // The crux: only a version-less lookup resolves.
          return asked.hasVersion() ? undefined : modelComponent;
        },
      },
    },
  };

  const warnings: string[] = [];
  const consoleLines: string[] = [];
  const logger: any = {
    console: (msg: string) => consoleLines.push(msg),
    consoleWarning: (msg: string) => warnings.push(msg),
  };
  return { workspace, logger, componentMap, lookedUp, warnings, consoleLines, removed };
}

describe('healMissingMainFiles', () => {
  describe('when the .bitmap entry records a version the scope cannot resolve', () => {
    it('retargets the entry at the main file the scope head records', async () => {
      const { wsPath, rootDir } = workspaceOnDisk();
      const { workspace, logger, componentMap } = stubWorkspace(wsPath, rootDir, 'index.ts');

      const healed = await healMissingMainFiles(workspace, logger);

      expect(healed).to.have.lengthOf(1);
      expect(healed[0].retargetedTo).to.equal('index.ts');
      expect(componentMap.mainFile).to.equal('index.ts');
    });

    // The regression guard. Looking the component up WITH the stale version made every scheduled
    // main sync decline with "not on the scope" for a component the scope had, and no amount of
    // retrying could clear it.
    it('never asks the scope for the stale version, only for the component', async () => {
      const { wsPath, rootDir } = workspaceOnDisk();
      const { workspace, logger, lookedUp } = stubWorkspace(wsPath, rootDir, 'index.ts');

      await healMissingMainFiles(workspace, logger);

      expect(lookedUp).to.have.lengthOf(1);
      expect(lookedUp[0]).to.equal(ID_STR);
      expect(lookedUp[0]).to.not.contain(STALE_VERSION);
    });
  });

  it('leaves the entry alone and says so when the head names no main file', async () => {
    const { wsPath, rootDir } = workspaceOnDisk();
    const { workspace, logger, componentMap, warnings, removed } = stubWorkspace(wsPath, rootDir, undefined);

    const healed = await healMissingMainFiles(workspace, logger);

    expect(healed).to.have.lengthOf(0);
    expect(removed).to.have.lengthOf(0);
    expect(componentMap.mainFile).to.equal('dist/index.d.ts');
    expect(warnings.join('\n')).to.contain('no head on the scope to compare against');
  });

  it('does nothing when every recorded main file is on disk', async () => {
    const { wsPath, rootDir } = workspaceOnDisk();
    const { workspace, logger, lookedUp } = stubWorkspace(wsPath, rootDir, 'index.ts');
    workspace.consumer.bitMap.components[0].mainFile = 'index.ts';

    const healed = await healMissingMainFiles(workspace, logger);

    expect(healed).to.have.lengthOf(0);
    expect(lookedUp).to.have.lengthOf(0);
  });
});
