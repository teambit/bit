import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import type { TrackerMain } from '@teambit/tracker';
import { TrackerAspect } from '@teambit/tracker';
import type { ExportMain } from '@teambit/export';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

const pngFixture = path.resolve(__dirname, '../../../e2e/fixtures/png_fixture.png');

/**
 * a component with a binary (PNG) file is tagged, exported and imported. the size of the file should not change.
 * it lives in the snapping aspect since tagging needs it.
 */
describe('binary files', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];
  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  async function tagAndExport(rootDirFiles: { mainFile: string; withFooJs: boolean }) {
    const authorWorkspace = mockWorkspace();
    workspaces.push(authorWorkspace);
    const { workspacePath } = authorWorkspace;
    const destPngFile = path.join(workspacePath, 'bar', 'png_fixture.png');
    fs.copySync(pngFixture, destPngFile);
    const pngSize = fs.statSync(destPngFile).size;
    if (rootDirFiles.withFooJs) {
      fs.outputFileSync(
        path.join(workspacePath, 'bar', 'foo.js'),
        "module.exports = function foo() { return 'got foo'; };\n"
      );
    }
    const harmony = await loadManyAspects(
      [WorkspaceAspect, TrackerAspect, SnappingAspect, ExportAspect, ScopeAspect],
      workspacePath
    );
    await harmony
      .get<TrackerMain>(TrackerAspect.id)
      .track({ rootDir: 'bar', componentName: 'bar/foo', mainFile: rootDirFiles.mainFile });
    await harmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false, ids: ['bar/foo'] });
    await harmony.get<ExportMain>(ExportAspect.id).export();
    const remoteIds = await harmony.get<ScopeMain>(ScopeAspect.id).listRemoteScope(authorWorkspace.remoteScopeName);
    return { authorWorkspace, pngSize, remoteIds };
  }

  async function importInNewWorkspace(authorWorkspace: WorkspaceData, flags: Record<string, any> = {}) {
    const importerWorkspace = mockWorkspace();
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
      await importCmd.report([[`${authorWorkspace.remoteScopeName}/bar/foo`]], flags);
    } finally {
      process.chdir(originalCwd);
    }
    return importerWorkspace;
  }

  describe('exporting a PNG file in addition to a .js file', () => {
    let author: Awaited<ReturnType<typeof tagAndExport>>;
    let importerWorkspace: WorkspaceData;
    before(async () => {
      author = await tagAndExport({ mainFile: 'foo.js', withFooJs: true });
      importerWorkspace = await importInNewWorkspace(author.authorWorkspace);
    });
    it('should export it with no errors', () => {
      expect(author.remoteIds).to.have.lengthOf(1);
      expect(author.remoteIds[0].toStringWithoutVersion()).to.equal(
        `${author.authorWorkspace.remoteScopeName}/bar/foo`
      );
    });
    it('the size of the binary file should not be changed after importing', () => {
      const importedPng = path.join(
        importerWorkspace.workspacePath,
        author.authorWorkspace.remoteScopeName,
        'bar/foo/png_fixture.png'
      );
      expect(fs.statSync(importedPng).size).to.equal(author.pngSize);
    });
  });

  // legacy test, to check the writing of links in node_modules for author.
  // new code doesn't have it. only one symlink and that's it.
  describe('exporting a PNG file as the only file', () => {
    let author: Awaited<ReturnType<typeof tagAndExport>>;
    let importerWorkspace: WorkspaceData;
    before(async () => {
      author = await tagAndExport({ mainFile: 'png_fixture.png', withFooJs: false });
      importerWorkspace = await importInNewWorkspace(author.authorWorkspace, { path: 'components/bar/foo' });
    });
    it('should export it with no errors', () => {
      expect(author.remoteIds).to.have.lengthOf(1);
      expect(author.remoteIds[0].toStringWithoutVersion()).to.equal(
        `${author.authorWorkspace.remoteScopeName}/bar/foo`
      );
    });
    it('should not install a package "undefined"', () => {
      expect(fs.existsSync(path.join(author.authorWorkspace.workspacePath, 'node_modules/undefined'))).to.be.false;
    });
    it('the size of the binary file should not be changed after importing', () => {
      const importedPng = path.join(importerWorkspace.workspacePath, 'components/bar/foo/png_fixture.png');
      expect(fs.statSync(importedPng).size).to.equal(author.pngSize);
    });
  });
});
