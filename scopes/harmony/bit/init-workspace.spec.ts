import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { globSync } from 'glob';
import { execSync } from 'child_process';
import stripAnsi from 'strip-ansi';
import { parse } from 'comment-json';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { SnappingAspect } from '@teambit/snapping';
import type { SnappingMain } from '@teambit/snapping';
import { TrackerAspect } from '@teambit/tracker';
import type { TrackerMain } from '@teambit/tracker';
import { StatusAspect } from '@teambit/status';
import type { StatusMain } from '@teambit/status';
import { HostInitializerAspect } from '@teambit/host-initializer';
import { CLIAspect } from '@teambit/cli';
import type { CLIMain } from '@teambit/cli';
import type { Workspace } from '@teambit/workspace';
import { loadBit } from './load-bit';

/**
 * "bit init" on a workspace that already has components and model data, and the commands that need to
 * repair a half-initialized workspace before they run (the loading of Bit itself). they need the
 * whole of Bit, which is why they live in the top aspect.
 */
describe('bit init on an existing workspace', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];
  const createWorkspace = (): WorkspaceData => {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    return workspaceData;
  };
  const readBitMap = (workspacePath: string): Record<string, any> =>
    parse(fs.readFileSync(path.join(workspacePath, '.bitmap'), 'utf8')) as Record<string, any>;
  const isDirectory = (dirPath: string) => fs.pathExistsSync(dirPath) && fs.statSync(dirPath).isDirectory();

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('an existing environment with model and with modified bitMap', () => {
    let workspacePath: string;
    let clonePath: string;
    let bitMap: Record<string, any>;
    let localConsumerFiles: string[];

    const filter = (file: string) => !file.includes('bitmap-history') && !file.includes('workspace-config-history');
    // same as the e2e helper: all files, hidden included
    const getConsumerFiles = (includeFilter = true) => {
      const files = globSync('**/*', { cwd: workspacePath, dot: true }).map((file) => path.normalize(file));
      return includeFilter ? files.filter(filter) : files;
    };
    const restoreClone = () => {
      fs.emptyDirSync(workspacePath);
      fs.copySync(clonePath, workspacePath);
    };
    /** a fresh harmony stands for a new process. the command is the one the CLI registers */
    async function runInit(flags: Record<string, any>) {
      const harmony = await loadManyAspects([HostInitializerAspect], workspacePath);
      const command = harmony.get<CLIMain>(CLIAspect.id).getCommand('init');
      if (!command?.report) throw new Error('the "init" command is not registered');
      const originalCwd = process.cwd();
      process.chdir(workspacePath);
      try {
        return await command.report([undefined as unknown as string], { skipInteractive: true, ...flags });
      } finally {
        process.chdir(originalCwd);
      }
    }

    before(async () => {
      ({ workspacePath } = createWorkspace());
      fs.outputFileSync(path.join(workspacePath, 'bar/foo.js'), 'module.exports = "foo";\n');
      const harmony = await loadManyAspects([WorkspaceAspect, TrackerAspect, SnappingAspect], workspacePath);
      const tracker = harmony.get<TrackerMain>(TrackerAspect.id);
      await tracker.track({ rootDir: 'bar', componentName: 'bar/foo' }); // this modifies bitMap
      await harmony.get<Workspace>(WorkspaceAspect.id).bitMap.write();
      await harmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false, version: '0.0.1' }); // this creates objects in .bit dir

      bitMap = readBitMap(workspacePath);
      localConsumerFiles = getConsumerFiles();
      clonePath = `${workspacePath}-clone`;
      workspaces.push({ workspacePath: clonePath, remoteScopePath: clonePath, remoteScopeName: '' });
      fs.copySync(workspacePath, clonePath);
    });

    describe('bit init', () => {
      before(async () => {
        await runInit({ noPackageJson: true });
      });
      it('should not change BitMap file', () => {
        const currentBitMap = readBitMap(workspacePath);
        expect(currentBitMap).to.be.deep.equal(bitMap);
        expect(currentBitMap).to.have.property('bar/foo');
      });
      it('should not change .bit directory', () => {
        expect(getConsumerFiles()).to.be.deep.equal(localConsumerFiles);
      });
    });

    describe('bit init --reset', () => {
      before(async () => {
        restoreClone();
        await runInit({ reset: true, noPackageJson: true });
      });
      it('should not change BitMap file', () => {
        const currentBitMap = readBitMap(workspacePath);
        expect(currentBitMap).to.be.deep.equal(bitMap);
        expect(currentBitMap).to.have.property('bar/foo');
      });
      it('should not change .bit directory', () => {
        expect(getConsumerFiles()).to.be.deep.equal(localConsumerFiles);
      });
    });

    describe('bit init --reset-hard', () => {
      before(async () => {
        restoreClone();
        await runInit({ resetHard: true });
      });
      it('should recreate the BitMap file', () => {
        const currentBitMap = readBitMap(workspacePath);
        expect(currentBitMap).to.not.be.deep.equal(bitMap);
        expect(currentBitMap).to.not.have.property('bar/foo@0.0.1');
      });
      it('should recreate .bit directory', () => {
        expect(getConsumerFiles(false)).to.not.be.deep.equal(localConsumerFiles);
      });
      it('.bit/objects directory should be empty', () => {
        const objectsDir = path.join(workspacePath, '.bit', 'objects');
        expect(isDirectory(objectsDir)).to.be.true;
        expect(fs.readdirSync(objectsDir)).to.have.lengthOf(0);
      });
      it('should not delete the user files', () => {
        expect(fs.pathExistsSync(path.join(workspacePath, 'bar/foo.js'))).to.be.true;
      });
      it('bit status should show nothing-to-tag', async () => {
        const harmony = await loadManyAspects([WorkspaceAspect, StatusAspect], workspacePath);
        const status = await harmony.get<StatusMain>(StatusAspect.id).status({});
        Object.entries(status).forEach(([key, value]) => {
          // the lane ids are not lists, and the components with issues are excluded like the e2e helper does
          if (!Array.isArray(value) || key === 'componentsWithIssues') return;
          expect(value, `status.${key} should be empty`).to.have.lengthOf(0);
        });
      });
    });
  });

  // the config is loaded before any aspect runs, so a broken or half-created workspace is repaired (or
  // reported) right at the beginning of every command
  describe('loading Bit', () => {
    describe('when workspace.jsonc file is invalid', () => {
      it('bit status should throw a descriptive error', async () => {
        const { workspacePath } = createWorkspace();
        fs.writeFileSync(path.join(workspacePath, 'workspace.jsonc'), '"corrupted');
        let error: Error | undefined;
        try {
          await loadBit(workspacePath);
        } catch (err: any) {
          error = err;
        }
        if (!error) throw new Error('expected loadBit to throw');
        expect(stripAnsi(error.message)).to.have.string('failed parsing the workspace.jsonc file at');
      });
    });

    describe('when there is .bitmap, workspace.jsonc but not .bit dir', () => {
      describe('when .bit located directly on workspace root', () => {
        it('any command should not throw an error and should rebuild .bit dir', async () => {
          const { workspacePath } = createWorkspace();
          fs.removeSync(path.join(workspacePath, '.bit'));
          await loadBit(workspacePath);
          expect(isDirectory(path.join(workspacePath, '.bit'))).to.be.true;
        });
      });
      describe('when bit located on .git', () => {
        it('any command should not throw an error and should rebuild .bit dir', async () => {
          const { workspacePath } = createWorkspace();
          fs.emptyDirSync(workspacePath);
          execSync('git init', { cwd: workspacePath, stdio: 'ignore' });
          const harmony = await loadManyAspects([HostInitializerAspect], workspacePath);
          const initCmd = harmony.get<CLIMain>(CLIAspect.id).getCommand('init');
          const originalCwd = process.cwd();
          process.chdir(workspacePath);
          try {
            await initCmd!.report!([undefined as unknown as string], { skipInteractive: true });
          } finally {
            process.chdir(originalCwd);
          }
          fs.removeSync(path.join(workspacePath, '.git/bit'));
          await loadBit(workspacePath);
          expect(isDirectory(path.join(workspacePath, '.git/bit'))).to.be.true;
        });
      });
    });
  });
});
