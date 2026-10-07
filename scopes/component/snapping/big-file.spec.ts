import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import type { TrackerMain } from '@teambit/tracker';
import { TrackerAspect } from '@teambit/tracker';
import type { ExportMain } from '@teambit/export';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

/**
 * a component with a big text file (~600KB, Windows line endings) is tagged, exported and imported.
 * it lives in the snapping aspect since tagging needs it.
 */
describe('big text file', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];
  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('Windows format (\\r\\n)', () => {
    let authorWorkspace: WorkspaceData;
    let importerWorkspace: WorkspaceData;
    let importOutput: string;
    before(async () => {
      authorWorkspace = mockWorkspace();
      workspaces.push(authorWorkspace);
      const { workspacePath } = authorWorkspace;
      const lines: string[] = [];
      for (let i = 0; lines.join('\n').length < 600 * 1024; i += 1) {
        lines.push(`line ${i}: the quick brown fox jumps over the lazy dog, again and again and again`);
      }
      const windowsFormatContent = lines.join('\r\n');
      fs.outputFileSync(path.join(workspacePath, 'bar', 'big-text-file.txt'), windowsFormatContent);
      fs.outputFileSync(
        path.join(workspacePath, 'bar', 'foo.js'),
        "module.exports = function foo() { return 'got foo'; };\n"
      );

      const harmony = await loadManyAspects(
        [WorkspaceAspect, TrackerAspect, SnappingAspect, ExportAspect],
        workspacePath
      );
      await harmony
        .get<TrackerMain>(TrackerAspect.id)
        .track({ rootDir: 'bar', componentName: 'bar/text', mainFile: 'foo.js' });
      // tagging the component should not throw any error
      const tagResults = await harmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false, ids: ['bar/text'] });
      expect(tagResults?.taggedComponents).to.have.lengthOf(1);
      await harmony.get<ExportMain>(ExportAspect.id).export();

      importerWorkspace = mockWorkspace();
      workspaces.push(importerWorkspace);
      const scopeJsonPath = path.join(importerWorkspace.workspacePath, '.bit', 'scope.json');
      const scopeJson = fs.readJsonSync(scopeJsonPath);
      scopeJson.remotes = {
        ...scopeJson.remotes,
        [authorWorkspace.remoteScopeName]: `file://${authorWorkspace.remoteScopePath}`,
      };
      fs.writeJsonSync(scopeJsonPath, scopeJson, { spaces: 2 });

      const importerHarmony = await loadManyAspects(
        [WorkspaceAspect, ImporterAspect, CLIAspect],
        importerWorkspace.workspacePath
      );
      const importCmd = importerHarmony.get<CLIMain>(CLIAspect.id).getCommand('import');
      if (!importCmd?.report) throw new Error('the "import" command is not registered');
      const originalCwd = process.cwd();
      process.chdir(importerWorkspace.workspacePath);
      try {
        importOutput = stripAnsi(
          (await importCmd.report([[`${authorWorkspace.remoteScopeName}/bar/text`]], {})) as string
        );
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should import with no errors', () => {
      expect(importOutput).to.have.string('successfully imported one component');
    });
    it('should import the big file', () => {
      const filePath = path.join(
        importerWorkspace.workspacePath,
        authorWorkspace.remoteScopeName,
        'bar/text/big-text-file.txt'
      );
      expect(fs.existsSync(filePath)).to.be.true;
      expect(fs.statSync(filePath).size).to.be.greaterThan(0);
    });
  });
});
