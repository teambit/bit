import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace, mockBareScope } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import type { TrackerMain } from '@teambit/tracker';
import { TrackerAspect } from '@teambit/tracker';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import type { Workspace } from '@teambit/workspace';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

/**
 * "bit pattern" flows. they live in the snapping aspect rather than next to the command in the workspace aspect,
 * since the --remote flows need tag and export, and the workspace aspect must not depend on them.
 */

/** a fresh harmony per call, to simulate a new process running a new command */
async function loadWorkspace(workspacePath: string) {
  const harmony = await loadManyAspects(
    [WorkspaceAspect, SnappingAspect, ExportAspect, ImporterAspect, TrackerAspect],
    workspacePath
  );
  const cli = harmony.get<CLIMain>(CLIAspect.id);
  const patternCmd = cli.getCommand('pattern');
  if (!patternCmd?.report || !patternCmd.json) throw new Error('the "pattern" command is not registered');
  return {
    workspace: harmony.get<Workspace>(WorkspaceAspect.id),
    snapping: harmony.get<SnappingMain>(SnappingAspect.id),
    tracker: harmony.get<TrackerMain>(TrackerAspect.id),
    pattern: async (pattern: string, flags: Record<string, any> = {}) =>
      stripAnsi((await patternCmd.report!([pattern] as any, flags)) as string),
    patternJson: async (pattern: string, flags: Record<string, any> = {}) =>
      (await patternCmd.json!([pattern] as any, flags)) as unknown[],
    exportAll: async () => {
      const exportCmd = cli.getCommand('export');
      if (!exportCmd?.report) throw new Error('the "export" command is not registered');
      await exportCmd.report([[]] as any, {});
    },
  };
}

/** chai has no async throw assertion that also matches a message */
async function expectToReject(fn: () => Promise<unknown>, messagePart?: string) {
  try {
    await fn();
  } catch (err: any) {
    if (messagePart) expect(stripAnsi(err.message)).to.have.string(messagePart);
    return;
  }
  throw new Error(`expected to reject${messagePart ? ` with "${messagePart}"` : ''}, but it resolved`);
}

async function addRemote(workspacePath: string, remoteScopeName: string, remoteScopePath: string) {
  const scopeJsonPath = path.join(workspacePath, '.bit', 'scope.json');
  const scopeJson = await fs.readJson(scopeJsonPath);
  scopeJson.remotes = { ...scopeJson.remotes, [remoteScopeName]: `file://${remoteScopePath}` };
  await fs.writeJson(scopeJsonPath, scopeJson);
}

describe('bit pattern command', function () {
  this.timeout(0);

  describe('general pattern matching', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = mockWorkspace();
      await mockComponents(workspaceData.workspacePath, { numOfComponents: 3 }); // comp1, comp2, comp3
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });

    it('should match all components with **', async () => {
      const { pattern } = await loadWorkspace(workspaceData.workspacePath);
      const result = await pattern('**');
      expect(result).to.include('comp1');
      expect(result).to.include('comp2');
      expect(result).to.include('comp3');
      expect(result).to.include('found 3 components');
    });

    it('should match specific component by name', async () => {
      const { pattern } = await loadWorkspace(workspaceData.workspacePath);
      const result = await pattern('comp1');
      expect(result).to.include('comp1');
      expect(result).to.not.include('comp2');
      expect(result).to.not.include('comp3');
      expect(result).to.include('found 1 component');
    });

    it('should match components with comma-separated patterns', async () => {
      const { pattern } = await loadWorkspace(workspaceData.workspacePath);
      // Use wildcard patterns to match regardless of scope
      const result = await pattern('**/comp1, **/comp3');
      expect(result).to.include('comp1');
      expect(result).to.not.include('comp2');
      expect(result).to.include('comp3');
      expect(result).to.include('found 2 components');
    });

    it('should return JSON format when using --json flag', async () => {
      const { patternJson } = await loadWorkspace(workspaceData.workspacePath);
      const result = await patternJson('**', { json: true });
      expect(Array.isArray(result)).to.be.true;
      expect(result.length).to.equal(3);
      const resultStrings = result.map((r) => (typeof r === 'string' ? r : JSON.stringify(r)));
      expect(resultStrings.some((id) => id.includes('comp1'))).to.be.true;
      expect(resultStrings.some((id) => id.includes('comp2'))).to.be.true;
      expect(resultStrings.some((id) => id.includes('comp3'))).to.be.true;
    });

    it('should handle non-matching patterns gracefully', async () => {
      const { pattern } = await loadWorkspace(workspaceData.workspacePath);
      await expectToReject(() => pattern('non-existent-component'));
    });
  });

  describe('pattern exclusion with negation (!)', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = mockWorkspace();
      await mockComponents(workspaceData.workspacePath, { numOfComponents: 2 }); // comp1, comp2
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });

    describe('basic exclusion patterns', () => {
      it('should exclude comp1 when using pattern "**, !**/comp1"', async () => {
        const { pattern } = await loadWorkspace(workspaceData.workspacePath);
        const result = await pattern('**, !**/comp1');
        expect(result).to.not.include('comp1');
        expect(result).to.include('comp2');
      });
    });

    describe('full component ID exclusion', () => {
      it('should exclude comp1 when using pattern with just "!scope-name/comp1"', async () => {
        const { pattern } = await loadWorkspace(workspaceData.workspacePath);
        const result = await pattern(`!${workspaceData.remoteScopeName}/comp1`);
        expect(result).to.not.include('comp1');
        expect(result).to.include('comp2');
        expect(result).to.include('found 1 component');
      });

      it('should exclude both components when using "!scope-name/comp1, !scope-name/comp2"', async () => {
        const { pattern } = await loadWorkspace(workspaceData.workspacePath);
        const { remoteScopeName } = workspaceData;
        const result = await pattern(`!${remoteScopeName}/comp1, !${remoteScopeName}/comp2`);
        expect(result).to.include('found 0 components');
      });
    });
  });

  describe('pattern with --remote flag', () => {
    let workspaceData: WorkspaceData;
    let scopeName: string;

    const trackAll = async (
      workspacePath: string,
      comps: Array<{ rootDir: string; componentName: string; defaultScope?: string }>
    ) => {
      comps.forEach(({ rootDir }) => fs.outputFileSync(path.join(workspacePath, rootDir, 'index.js'), ''));
      const { tracker, workspace } = await loadWorkspace(workspacePath);
      for (const comp of comps) await tracker.track(comp);
      await workspace.bitMap.write();
    };
    const tagAndExport = async (workspacePath: string) => {
      const { snapping } = await loadWorkspace(workspacePath);
      await snapping.tag({ build: false, version: '0.0.1' });
      const { exportAll } = await loadWorkspace(workspacePath);
      await exportAll();
    };

    let anotherRemote: string;
    let anotherRemotePath: string;
    before(async () => {
      workspaceData = mockWorkspace();
      scopeName = workspaceData.remoteScopeName;
      // the remotes are read once per workspace load, so the second scope is added before the first load
      const bareScope = mockBareScope(workspaceData.remoteScopePath);
      anotherRemote = bareScope.scopeName;
      anotherRemotePath = bareScope.scopePath;
      await addRemote(workspaceData.workspacePath, anotherRemote, anotherRemotePath);
      await trackAll(workspaceData.workspacePath, [
        { rootDir: 'utils/is/string', componentName: 'utils/is/string' },
        { rootDir: 'utils/is/type', componentName: 'utils/is/type' },
        { rootDir: 'utils/fs/read', componentName: 'utils/fs/read' },
        { rootDir: 'other/comp', componentName: 'other/comp', defaultScope: anotherRemote },
      ]);
      await tagAndExport(workspaceData.workspacePath);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
      await fs.remove(anotherRemotePath);
    });

    it('should list all components from remote scope with **', async () => {
      const { pattern } = await loadWorkspace(workspaceData.workspacePath);
      const result = await pattern(`${scopeName}/**`, { remote: true });
      expect(result).to.include('utils/is/string');
      expect(result).to.include('utils/is/type');
      expect(result).to.include('utils/fs/read');
      expect(result).to.include('found 3 components');
    });

    // remote has its own negation handling on top of the shared pool filter: negated patterns are left out
    // when deriving which scopes to fetch, and only then applied to the fetched ids
    it('should support wildcard exclusion patterns from remote', async () => {
      const { pattern } = await loadWorkspace(workspaceData.workspacePath);
      const result = await pattern(`${scopeName}/**, !${scopeName}/utils/fs/*`, { remote: true });
      expect(result).to.include('utils/is/string');
      expect(result).to.include('utils/is/type');
      expect(result).to.not.include('utils/fs/read');
      expect(result).to.include('found 2 components');
    });

    it('should throw error when pattern does not include scope name', async () => {
      const { pattern } = await loadWorkspace(workspaceData.workspacePath);
      await expectToReject(
        () => pattern('invalid-pattern', { remote: true }),
        'when using --remote, the pattern must include the scope name'
      );
    });

    describe('with multiple remote scopes', () => {
      it('should list components from multiple remote scopes', async () => {
        const { pattern } = await loadWorkspace(workspaceData.workspacePath);
        const result = await pattern(`${scopeName}/utils/is/*, ${anotherRemote}/**`, { remote: true });
        expect(result).to.include('utils/is/string');
        expect(result).to.include('utils/is/type');
        expect(result).to.include('comp');
        expect(result).to.include('found 3 components');
      });
    });
  });
});
