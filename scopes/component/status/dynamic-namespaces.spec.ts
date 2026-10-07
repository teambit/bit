import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { parse } from 'comment-json';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ComponentID } from '@teambit/component-id';
import { TrackerAspect } from '@teambit/tracker';
import type { TrackerMain } from '@teambit/tracker';
import { SnappingAspect } from '@teambit/snapping';
import type { SnappingMain } from '@teambit/snapping';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import { ListerAspect } from '@teambit/lister';
import { StatusAspect } from './status.aspect';

/**
 * components with a multi-level namespace in their name. it lives in the status aspect rather than in the
 * snapping aspect, since the flows assert the status, and tag is needed to set up the components.
 */
describe('dynamic namespaces', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];

  /** a workspace with its own bare scope (the scope its components get exported to) */
  function createWorkspace(remotes: { remoteScopeName: string; remoteScopePath: string }[] = []): WorkspaceData {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    // the remotes are read once per workspace load, so they are added before the first load
    const scopeJsonPath = path.join(workspaceData.workspacePath, '.bit', 'scope.json');
    const scopeJson = fs.readJsonSync(scopeJsonPath);
    remotes.forEach((remote) => {
      scopeJson.remotes = { ...scopeJson.remotes, [remote.remoteScopeName]: `file://${remote.remoteScopePath}` };
    });
    fs.writeJsonSync(scopeJsonPath, scopeJson, { spaces: 2 });
    return workspaceData;
  }

  /** a fresh harmony per call, to simulate a new process running a new command */
  async function load(workspacePath: string) {
    const harmony = await loadManyAspects(
      [WorkspaceAspect, SnappingAspect, ExportAspect, ImporterAspect, ListerAspect, StatusAspect, TrackerAspect],
      workspacePath
    );
    const cli = harmony.get<CLIMain>(CLIAspect.id);
    const getCmd = (name: string) => {
      const cmd = cli.getCommand(name);
      if (!cmd) throw new Error(`the "${name}" command is not registered`);
      return cmd;
    };
    /** commands resolve paths against the cwd */
    const inWorkspace = async <T>(fn: () => Promise<T>): Promise<T> => {
      const originalCwd = process.cwd();
      process.chdir(workspacePath);
      try {
        return await fn();
      } finally {
        process.chdir(originalCwd);
      }
    };
    const report = (name: string, args: any[], flags: Record<string, any> = {}) =>
      inWorkspace(async () => {
        const output: any = await getCmd(name).report!(args as any, flags);
        return stripAnsi(typeof output === 'string' ? output : output.data);
      });
    return {
      tracker: harmony.get<TrackerMain>(TrackerAspect.id),
      workspace: harmony.get<Workspace>(WorkspaceAspect.id),
      snapping: harmony.get<SnappingMain>(SnappingAspect.id),
      exportCmd: () => report('export', [[]]),
      importCmd: (ids: string[], flags: Record<string, any> = {}) => report('import', [ids], flags),
      statusCmd: () => report('status', []),
      listCmd: (flags: Record<string, any> = {}) => report('list', [], flags),
      catComponent: (id: string) =>
        inWorkspace(async () => (await getCmd('cat-component').json!([id] as any, {})) as Record<string, any>),
    };
  }

  async function track(
    workspacePath: string,
    trackData: { rootDir: string; componentName: string; defaultScope?: string }
  ) {
    const { tracker, workspace } = await load(workspacePath);
    await tracker.track(trackData);
    await workspace.bitMap.write();
  }

  async function tag(workspacePath: string) {
    const { snapping } = await load(workspacePath);
    await snapping.tag({ build: false });
  }

  /** .bitmap opens with a comment banner */
  const readBitMap = (workspacePath: string): Record<string, any> =>
    parse(fs.readFileSync(path.join(workspacePath, '.bitmap'), 'utf8'), undefined, true) as Record<string, any>;

  const isFile = (filePath: string) => fs.existsSync(filePath) && fs.statSync(filePath).isFile();

  async function expectToReject(fn: () => Promise<unknown>, messagePart: string) {
    try {
      await fn();
    } catch (err: any) {
      expect(stripAnsi(err.message)).to.have.string(messagePart);
      return;
    }
    throw new Error(`expected to reject with "${messagePart}", but it resolved`);
  }

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  const veryLongName = 'this/is/a/very/large/name/for/a/component';
  describe(`multi-level namespace. using name "${veryLongName}"`, () => {
    const componentName = veryLongName;
    let workspaceData: WorkspaceData;
    let catComp: Record<string, any>;

    before(async () => {
      workspaceData = createWorkspace();
      const { workspacePath, remoteScopeName } = workspaceData;
      fs.outputFileSync(path.join(workspacePath, 'bar', 'foo.js'), 'bar');
      await track(workspacePath, { rootDir: 'bar', componentName, defaultScope: remoteScopeName });
      await tag(workspacePath);
      catComp = await (await load(workspacePath)).catComponent(componentName);
    });
    it('should save the component correctly on the model', () => {
      expect(catComp.name).to.equal(componentName);
      // the legacy "box" field would be prepended to the name when loaded, so the name check alone can't catch it
      expect(catComp).to.not.have.property('box');
    });
    it('bit status should show the component as staged', async () => {
      const statusOutput = await (await load(workspaceData.workspacePath)).statusCmd();
      expect(statusOutput).to.have.string('staged');
      expect(statusOutput).to.have.string(componentName);
    });
    it('bit list should list the component', async () => {
      const listOutput = await (await load(workspaceData.workspacePath)).listCmd({ localScope: true });
      expect(listOutput).to.have.string(componentName);
    });
    it('bit show should show the component with the correct name', async () => {
      const { workspace } = await load(workspaceData.workspacePath);
      const component = await workspace.get(
        ComponentID.fromString(`${workspaceData.remoteScopeName}/${componentName}`)
      );
      expect(component.id.fullName).to.equal(componentName);
    });
    describe('after import', () => {
      let importer: WorkspaceData;
      before(async () => {
        await (await load(workspaceData.workspacePath)).exportCmd();
        importer = createWorkspace([workspaceData]);
        await (await load(importer.workspacePath)).importCmd([`${workspaceData.remoteScopeName}/${componentName}`]);
      });
      it('should create the directories according to the multiple namespaces', () => {
        const componentDir = path.join(importer.workspacePath, workspaceData.remoteScopeName, componentName);
        expect(fs.existsSync(componentDir)).to.be.true;
        expect(isFile(path.join(componentDir, 'foo.js'))).to.be.true;
      });
    });
  });

  describe('import a component with same id string as a local different component', () => {
    let importer: WorkspaceData;
    let remoteName: string;
    before(async () => {
      const author = createWorkspace();
      remoteName = author.remoteScopeName;
      fs.outputFileSync(path.join(author.workspacePath, 'foo', 'foo.js'), 'foo');
      await track(author.workspacePath, { rootDir: 'foo', componentName: 'foo', defaultScope: remoteName });
      await tag(author.workspacePath);
      await (await load(author.workspacePath)).exportCmd();

      importer = createWorkspace([author]);
      fs.outputFileSync(path.join(importer.workspacePath, 'bar', 'foo.js'), 'foo');
      await track(importer.workspacePath, { rootDir: 'bar', componentName: 'foo', defaultScope: remoteName });
    });
    it('should throw an error and not allow the import', async () => {
      await expectToReject(
        async () => (await load(importer.workspacePath)).importCmd([`${remoteName}/foo`]),
        'unable to import'
      );
      // the bitmap has also a "$schema-version" key, which is not a component
      const componentIds = Object.keys(readBitMap(importer.workspacePath)).filter((key) => !key.startsWith('$'));
      expect(componentIds).to.have.lengthOf(1);
    });
    it('should throw an error also after tagging', async () => {
      await tag(importer.workspacePath);
      await expectToReject(
        async () => (await load(importer.workspacePath)).importCmd([`${remoteName}/foo`]),
        'unable to import'
      );
    });
  });
});
