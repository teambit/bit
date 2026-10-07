import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { assign, parse, stringify } from 'comment-json';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import type { TrackerMain } from '@teambit/tracker';
import { TrackerAspect } from '@teambit/tracker';
import type { ExportMain } from '@teambit/export';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import type { DependencyResolverMain, PackageManager } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { Workspace } from '@teambit/workspace';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { ListerMain } from '@teambit/lister';
import { ListerAspect } from '@teambit/lister';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

/**
 * "bit import" flows: a component is authored and exported from one workspace and imported into
 * another that has the first one's scope as a remote. it lives in the snapping aspect, since
 * authoring needs tag and the importer cannot depend on it. the flags validation is covered next to
 * the command, in the importer aspect (import.cmd.spec.ts).
 */
describe('bit import command', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];

  /** a workspace with its own bare scope. the scope is where components get exported to */
  function createWorkspace(): WorkspaceData {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    return workspaceData;
  }

  /** a workspace that has the scope of `remote` as a remote, which is what `bit remote add` does */
  function createWorkspaceWithRemote(remote: WorkspaceData): WorkspaceData {
    const workspaceData = createWorkspace();
    const scopeJsonPath = path.join(workspaceData.workspacePath, '.bit', 'scope.json');
    const scopeJson = fs.readJsonSync(scopeJsonPath);
    scopeJson.remotes = { ...scopeJson.remotes, [remote.remoteScopeName]: `file://${remote.remoteScopePath}` };
    fs.writeJsonSync(scopeJsonPath, scopeJson, { spaces: 2 });
    return workspaceData;
  }

  const workspaceConfigPath = (workspacePath: string) => path.join(workspacePath, 'workspace.jsonc');

  function setWorkspaceAspectConfig(workspacePath: string, aspectId: string, config: Record<string, any>) {
    const content = parse(fs.readFileSync(workspaceConfigPath(workspacePath), 'utf8')) as Record<string, any>;
    content[aspectId] = assign(content[aspectId] || {}, config);
    fs.writeFileSync(workspaceConfigPath(workspacePath), stringify(content, null, 2));
  }

  type CompToAuthor = { rootDir: string; name: string; main?: string };

  /** write the files, track them as components, tag and export. a fresh harmony per call, as a new process */
  async function author(
    workspaceData: WorkspaceData,
    files: Record<string, string>,
    comps: CompToAuthor[],
    { ids, ignoreIssues }: { ids?: string[]; ignoreIssues?: string } = {}
  ) {
    const { workspacePath } = workspaceData;
    Object.entries(files).forEach(([filePath, content]) =>
      fs.outputFileSync(path.join(workspacePath, filePath), content)
    );
    const harmony = await loadManyAspects(
      [WorkspaceAspect, TrackerAspect, SnappingAspect, ExportAspect],
      workspacePath
    );
    const tracker = harmony.get<TrackerMain>(TrackerAspect.id);
    for (const comp of comps) {
      await tracker.track({ rootDir: comp.rootDir, componentName: comp.name, mainFile: comp.main });
    }
    await harmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false, ids, ignoreIssues });
    await harmony.get<ExportMain>(ExportAspect.id).export();
  }

  /** run "bit import" the way a new process would: from the workspace dir, with a fresh harmony */
  async function runImport(
    workspacePath: string,
    ids: string[],
    flags: Record<string, any> = {},
    { externalPackageManager = false } = {}
  ): Promise<string> {
    const aspects = [WorkspaceAspect, ImporterAspect, CLIAspect];
    const harmony = await loadManyAspects(aspects, workspacePath);
    if (externalPackageManager) {
      // the workspace.jsonc has it already, but a global ~/.bitrc.jsonc of the developer overrides the config of
      // this aspect, so set it on the loaded one as well
      const depResolver = harmony.get<DependencyResolverMain>(DependencyResolverAspect.id);
      depResolver.config.externalPackageManager = true;
      depResolver.config.rootComponents = false;
      // the package manager is needed only to produce the manifest that gets written to package.json. a fake one
      // keeps this spec from depending on the pnpm aspect, and from installing anything
      // (the slot is keyed by the id of the registering aspect, so set it directly)
      const fakePackageManager = {
        install: async () => {
          throw new Error('no installation should run when an external package manager is used');
        },
      } as unknown as PackageManager;
      (depResolver as any).packageManagerSlot.map.set(depResolver.config.packageManager, fakePackageManager);
    }
    const importCmd = harmony.get<CLIMain>(CLIAspect.id).getCommand('import');
    if (!importCmd?.report) throw new Error('the "import" command is not registered');
    const originalCwd = process.cwd();
    process.chdir(workspacePath);
    try {
      return stripAnsi((await importCmd.report([ids], flags)) as string);
    } finally {
      process.chdir(originalCwd);
    }
  }

  /** chai has no async throw assertion that also matches a message */
  async function expectToReject(fn: () => Promise<unknown>, messagePart: string) {
    try {
      await fn();
    } catch (err: any) {
      expect(stripAnsi(err.message)).to.have.string(messagePart);
      return;
    }
    throw new Error(`expected to reject with "${messagePart}", but it resolved`);
  }

  /** .bitmap opens with a comment banner */
  const readBitMap = (workspacePath: string): Record<string, any> =>
    parse(fs.readFileSync(path.join(workspacePath, '.bitmap'), 'utf8'), undefined, true) as Record<string, any>;

  /** all the js/ts files of the workspace, relative to it, node_modules included */
  const getConsumerFiles = (workspacePath: string): string[] =>
    (fs.readdirSync(workspacePath, { recursive: true }) as string[])
      .map((file) => path.normalize(file))
      .filter((file) => /\.(js|ts)$/.test(file) && fs.statSync(path.join(workspacePath, file)).isFile());

  const expectToHaveId = (workspacePath: string, name: string, version: string) => {
    const bitMap = readBitMap(workspacePath);
    expect(bitMap).to.have.property(name);
    expect(bitMap[name].version).to.equal(version);
  };
  const expectNotToHaveId = (workspacePath: string, name: string) => {
    expect(readBitMap(workspacePath)).to.not.have.property(name);
  };

  const isFile = (filePath: string) => fs.existsSync(filePath) && fs.statSync(filePath).isFile();

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('stand alone component (without dependencies)', () => {
    let remote: WorkspaceData;
    let remoteName: string;
    let importer: WorkspaceData;
    let importOutput: string;
    before(async () => {
      remote = createWorkspace();
      remoteName = remote.remoteScopeName;
      await author(
        remote,
        {
          'global/simple.js': '',
          'src/imprel.js': '',
          'src/imprel.spec.js': '',
          'src/utils/myUtil.js': '',
        },
        [
          { rootDir: 'global', name: 'global/simple' },
          { rootDir: 'src', name: 'imprel/imprel', main: 'imprel.js' },
        ]
      );
      importer = createWorkspaceWithRemote(remote);
      importOutput = await runImport(importer.workspacePath, [`${remoteName}/global/simple`]);
    });

    it('should display a successful message', () => {
      expect(importOutput).to.have.string('successfully imported one component');
      expect(importOutput).to.have.string('global/simple');
      expect(importOutput).to.have.string('0.0.1');
    });
    it('should indicate that the imported component is new', () => {
      expect(importOutput).to.have.string('added');
      expect(importOutput).to.not.have.string('updated');
    });
    it('should add the component into bit.map file', () => {
      expect(readBitMap(importer.workspacePath)).to.have.property('global/simple');
    });

    describe('with multiple files located in different directories', () => {
      let workspacePath: string;
      before(async () => {
        workspacePath = createWorkspaceWithRemote(remote).workspacePath;
        const output = await runImport(workspacePath, [`${remoteName}/imprel/imprel`]);
        expect(output.includes('successfully imported one component')).to.be.true;
        expect(output.includes('imprel/imprel')).to.be.true;
      });
      it('should write the internal files according to their relative paths', () => {
        const imprelRoot = path.join(workspacePath, remoteName, 'imprel', 'imprel');
        expect(fs.existsSync(path.join(imprelRoot, 'imprel.js'))).to.be.true;
        expect(fs.existsSync(path.join(imprelRoot, 'imprel.spec.js'))).to.be.true;
        expect(fs.existsSync(path.join(imprelRoot, 'utils', 'myUtil.js'))).to.be.true;
      });
    });

    describe('when the default component directory already exist', () => {
      const getPaths = (workspacePath: string) => {
        const componentDir = path.join(workspacePath, remoteName, 'global/simple');
        return { componentDir, componentFileLocation: path.join(componentDir, 'simple.js') };
      };
      const simpleId = () => `${remoteName}/global/simple`;

      describe('when the destination is an existing empty directory', () => {
        it('should write the component to the specified path', async () => {
          const { workspacePath } = createWorkspaceWithRemote(remote);
          const { componentDir, componentFileLocation } = getPaths(workspacePath);
          fs.ensureDirSync(componentDir);
          await runImport(workspacePath, [simpleId()]);
          expect(isFile(componentFileLocation)).to.be.true;
        });
      });
      describe('when the destination directory is not empty', () => {
        let workspacePath: string;
        let existingFile: string;
        let componentFileLocation: string;
        let error: string;
        before(async () => {
          workspacePath = createWorkspaceWithRemote(remote).workspacePath;
          const paths = getPaths(workspacePath);
          componentFileLocation = paths.componentFileLocation;
          existingFile = path.join(paths.componentDir, 'my-file.js');
          fs.outputFileSync(existingFile, 'console.log()');
          try {
            await runImport(workspacePath, [simpleId()]);
          } catch (err: any) {
            error = stripAnsi(err.message);
          }
        });
        it('should not import the component', () => {
          expect(fs.existsSync(componentFileLocation)).to.be.false;
        });
        it('should not delete the existing file', () => {
          expect(isFile(existingFile)).to.be.true;
        });
        it('should throw an error', () => {
          expect(error).to.have.string('unable to import');
        });
        it('should import successfully if the --override flag is used', async () => {
          await runImport(workspacePath, [simpleId()], { override: true });
          expect(isFile(componentFileLocation)).to.be.true;
        });
      });
      describe('when the destination is a file', () => {
        let workspacePath: string;
        let componentDir: string;
        let componentFileLocation: string;
        let error: string;
        before(async () => {
          workspacePath = createWorkspaceWithRemote(remote).workspacePath;
          ({ componentDir, componentFileLocation } = getPaths(workspacePath));
          fs.outputFileSync(componentDir, 'console.log()');
          try {
            await runImport(workspacePath, [simpleId()]);
          } catch (err: any) {
            error = stripAnsi(err.message);
          }
        });
        it('should not import the component', () => {
          expect(fs.existsSync(componentFileLocation)).to.be.false;
        });
        it('should not delete the existing file', () => {
          expect(isFile(componentDir)).to.be.true;
        });
        it('should throw an error', () => {
          expect(error).to.have.string('unable to import');
        });
        it('should throw an error also when the --override flag is used', async () => {
          await expectToReject(() => runImport(workspacePath, [simpleId()], { override: true }), 'unable to import');
        });
      });
    });

    describe('with a specific path, using -p flag', () => {
      describe('when the destination is a non-exist directory', () => {
        it('should write the component to the specified path', async () => {
          const { workspacePath } = createWorkspaceWithRemote(remote);
          await runImport(workspacePath, [`${remoteName}/global/simple`], { path: 'my-custom-location' });
          expect(isFile(path.join(workspacePath, 'my-custom-location/simple.js'))).to.be.true;
        });
      });
    });

    describe('re-import after deleting the component physically', () => {
      it('should import the component successfully', async () => {
        const { workspacePath } = createWorkspaceWithRemote(remote);
        await runImport(workspacePath, [`${remoteName}/global/simple`]);
        fs.removeSync(path.join(workspacePath, 'components'));
        const output = await runImport(workspacePath, [`${remoteName}/global/simple`]);
        expect(output).to.have.string('successfully imported one component');
      });
    });

    describe('import component with custom dsl as destination dir for import', () => {
      describe('when the DSL is valid', () => {
        let workspacePath: string;
        let output: string;
        before(async () => {
          workspacePath = createWorkspaceWithRemote(remote).workspacePath;
          setWorkspaceAspectConfig(workspacePath, 'teambit.workspace/workspace', {
            defaultDirectory: '{scope}/-{name}-',
          });
          await runImport(workspacePath, [`${remoteName}/global/simple`]);
          output = await runImport(workspacePath, [`${remoteName}/global/simple`]);
        });
        it('should import the component successfully', () => {
          expect(output).to.have.string('successfully imported one component');
        });
        it('should import the component into new dir structure according to dsl', () => {
          const dir = path.join(workspacePath, remoteName, '-global/simple-');
          expect(fs.statSync(dir).isDirectory()).to.be.true;
          expect(fs.readdirSync(dir)).to.not.be.empty;
        });
        it('bitmap should contain component with correct rootDir according to dsl', () => {
          const bitMap = readBitMap(workspacePath);
          expect(bitMap).to.have.property('global/simple');
          expect(bitMap['global/simple'].rootDir).to.equal(`${remoteName}/-global/simple-`);
        });
      });
      describe('when the DSL has invalid parameters', () => {
        it('should throw an error saying it has an invalid parameter', async () => {
          const { workspacePath } = createWorkspaceWithRemote(remote);
          setWorkspaceAspectConfig(workspacePath, 'teambit.workspace/workspace', {
            defaultDirectory: '{non-exist-param}/{name}',
          });
          await expectToReject(
            () => runImport(workspacePath, [`${remoteName}/global/simple`]),
            'the "non-exist-param" part of the component structure "{non-exist-param}/{name}" is invalid'
          );
        });
      });
    });
  });

  describe('a component that has an old version on the remote', () => {
    let remote: WorkspaceData;
    let remoteName: string;
    let remoteBitMap: string;
    const fooPath = (workspacePath: string) => path.join(workspacePath, remoteName, 'bar', 'foo');
    before(async () => {
      remote = createWorkspace();
      remoteName = remote.remoteScopeName;
      await author(remote, { 'bar/foo.js': "module.exports = function foo() { return 'got foo'; };" }, [
        { rootDir: 'bar', name: 'bar/foo', main: 'foo.js' },
      ]);
      remoteBitMap = fs.readFileSync(path.join(remote.workspacePath, '.bitmap'), 'utf8');
    });

    describe('with an existing component in bit.map (as author)', () => {
      let workspacePath: string;
      let localConsumerFiles: string[];
      before(async () => {
        workspacePath = createWorkspaceWithRemote(remote).workspacePath;
        fs.writeFileSync(path.join(workspacePath, '.bitmap'), remoteBitMap);
        await runImport(workspacePath, [`${remoteName}/bar/foo`]);
        localConsumerFiles = getConsumerFiles(workspacePath);
      });
      // Prevent cases when I export a component with few files from different directories
      // and get it in another structure during imports (for example under components folder instead of original folder)
      it('should write the component to the paths specified in bit.map', () => {
        expect(localConsumerFiles).to.include(path.join('bar', 'foo.js'));
      });
      it('should not remove the originallySharedDir (because it is an AUTHORED component)', () => {
        expect(localConsumerFiles).not.to.include('foo.js'); // it shouldn't remove 'bar'.
      });
      it('should not write any file into components directory', () => {
        localConsumerFiles.forEach((fileName) => {
          expect(fileName.startsWith('components')).to.be.false;
        });
      });
      describe('importing the component again', () => {
        it('should not create an "undefined" package on node_modules', async () => {
          await runImport(workspacePath, [`${remoteName}/bar/foo`]);
          getConsumerFiles(workspacePath).forEach((fileName) => {
            expect(fileName.startsWith(path.join('node_modules', 'undefined'))).to.be.false;
          });
        });
      });
    });

    describe('import a component when the local version is modified', () => {
      /** import it and then modify it locally */
      async function importAndModify(): Promise<string> {
        const { workspacePath } = createWorkspaceWithRemote(remote);
        await runImport(workspacePath, [`${remoteName}/bar/foo`]);
        fs.outputFileSync(
          path.join(fooPath(workspacePath), 'foo.js'),
          "module.exports = function foo() { return 'got foo v2'; };"
        );
        return workspacePath;
      }
      describe('without --override flag', () => {
        it('should display a warning saying it was unable to import', async () => {
          const workspacePath = await importAndModify();
          await expectToReject(() => runImport(workspacePath, [`${remoteName}/bar/foo`]), 'unable to import');
        });
      });
      describe('with --override flag', () => {
        it('should display a successful message', async () => {
          const workspacePath = await importAndModify();
          const output = await runImport(workspacePath, [`${remoteName}/bar/foo`], { override: true });
          expect(output).to.have.string('successfully imported');
        });
      });
      describe('with --merge=manual', () => {
        it('should display a successful message', async () => {
          const workspacePath = await importAndModify();
          const output = await runImport(workspacePath, [`${remoteName}/bar/foo`], { merge: 'manual' });
          expect(output).to.have.string('successfully imported');
        });
      });
      describe('re-import a component after tagging the component', () => {
        it('should import successfully', async () => {
          const workspacePath = await importAndModify();
          const harmony = await loadManyAspects([WorkspaceAspect, SnappingAspect], workspacePath);
          await harmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false });
          const output = await runImport(workspacePath, [`${remoteName}/bar/foo`]);
          expect(output).to.have.string('successfully imported');
        });
      });
    });

    describe('importing a component when it has a local tag', () => {
      let workspacePath: string;
      before(async () => {
        workspacePath = createWorkspaceWithRemote(remote).workspacePath;
        await runImport(workspacePath, [`${remoteName}/bar/foo`], { path: 'components/bar/foo' });
        fs.outputFileSync(path.join(workspacePath, 'components/bar/foo/foo.js'), 'v2');
        const harmony = await loadManyAspects([WorkspaceAspect, SnappingAspect], workspacePath);
        const tagResults = await harmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false });
        expect(tagResults?.taggedComponents[0].id.version).to.equal('0.0.2');

        // at this stage, the remote component has only 0.0.1. The local component has also 0.0.2
        await runImport(workspacePath, [`${remoteName}/bar/foo`]);
      });
      const getModelComponent = async () => {
        const harmony = await loadManyAspects([WorkspaceAspect, ScopeAspect], workspacePath);
        const compId = await harmony.get<Workspace>(WorkspaceAspect.id).resolveComponentId(`${remoteName}/bar/foo`);
        return harmony.get<ScopeMain>(ScopeAspect.id).legacyScope.getModelComponent(compId);
      };
      it('should not remove the local version', async () => {
        const modelComponent = await getModelComponent();
        expect(modelComponent.versions).to.have.property('0.0.1');
        expect(modelComponent.versions).to.have.property('0.0.2');
      });
      it('should not override the local component', async () => {
        const modelComponent = await getModelComponent();
        expect(modelComponent).to.have.property('state');
        expect(modelComponent.state).to.have.property('versions');
        expect(modelComponent.state.versions).to.have.property('0.0.2');
      });
      describe('importing a specific version', () => {
        it('should not throw an error saying the component was not found', async () => {
          const output = await runImport(workspacePath, [`${remoteName}/bar/foo@0.0.1`]);
          expect(output).to.have.string('successfully imported');
        });
      });
    });
  });

  describe('import with wildcards', () => {
    let remote: WorkspaceData;
    let importer: WorkspaceData;
    let output: string;
    before(async () => {
      remote = createWorkspace();
      await mockComponents(remote.workspacePath, { numOfComponents: 3 });
      const harmony = await loadManyAspects([WorkspaceAspect, SnappingAspect, ExportAspect], remote.workspacePath);
      await harmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false });
      await harmony.get<ExportMain>(ExportAspect.id).export();
      importer = createWorkspaceWithRemote(remote);
    });
    describe('import the entire scope', () => {
      before(async () => {
        output = await runImport(importer.workspacePath, [`${remote.remoteScopeName}/*`]);
      });
      it('should import all components from the remote scope', () => {
        expect(output).to.have.string('comp1');
        expect(output).to.have.string('comp2');
        expect(output).to.have.string('comp3');
      });
      it('bit ls should show that all components from the remote scope were imported', async () => {
        const harmony = await loadManyAspects([WorkspaceAspect, ListerAspect], importer.workspacePath);
        const list = await harmony.get<ListerMain>(ListerAspect.id).localList(true);
        expect(list.filter((item) => item.id.scope === remote.remoteScopeName)).to.be.lengthOf(3);
      });
    });
  });

  describe('import with --dependencies-depth (chain: comp1 -> comp2 -> comp3 -> comp4)', () => {
    let remote: WorkspaceData;
    let remoteName: string;
    before(async () => {
      remote = createWorkspace();
      remoteName = remote.remoteScopeName;
      await mockComponents(remote.workspacePath, { numOfComponents: 4 });
      const harmony = await loadManyAspects([WorkspaceAspect, SnappingAspect, ExportAspect], remote.workspacePath);
      await harmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false });
      await harmony.get<ExportMain>(ExportAspect.id).export();

      // create a second tag for comp2 (and comp1, auto-tagged as a dependent), so comp1@0.0.1
      // still references comp2@0.0.1 while head of comp2 is 0.0.2. lets us assert that
      // --dependencies-head actually picks the head. preserve the comp3 require so the chain stays intact.
      fs.outputFileSync(
        path.join(remote.workspacePath, 'comp2/index.js'),
        `const comp3 = require('@${remoteName}/comp3');\nmodule.exports = () => 'comp2-v2 and ' + comp3();`
      );
      const harmony2 = await loadManyAspects([WorkspaceAspect, SnappingAspect, ExportAspect], remote.workspacePath);
      await harmony2.get<SnappingMain>(SnappingAspect.id).tag({ build: false, ids: ['comp2'] });
      await harmony2.get<ExportMain>(ExportAspect.id).export();
    });
    const importComp1 = async (id: string, flags: Record<string, any>) => {
      const { workspacePath } = createWorkspaceWithRemote(remote);
      await runImport(workspacePath, [`${remoteName}/${id}`], flags);
      return workspacePath;
    };

    describe('--dependencies-depth 1', () => {
      it('should import only the direct dep at the version comp1 references (comp2@0.0.1)', async () => {
        const workspacePath = await importComp1('comp1@0.0.1', { dependencies: true, dependenciesDepth: '1' });
        expectToHaveId(workspacePath, 'comp1', '0.0.1');
        expectToHaveId(workspacePath, 'comp2', '0.0.1');
        expectNotToHaveId(workspacePath, 'comp3');
        expectNotToHaveId(workspacePath, 'comp4');
      });
    });
    describe('--dependencies-depth 2', () => {
      it('should import direct deps and their direct deps (comp2, comp3) but not deeper', async () => {
        const workspacePath = await importComp1('comp1@0.0.1', { dependencies: true, dependenciesDepth: '2' });
        expectToHaveId(workspacePath, 'comp1', '0.0.1');
        expectToHaveId(workspacePath, 'comp2', '0.0.1');
        expectToHaveId(workspacePath, 'comp3', '0.0.1');
        expectNotToHaveId(workspacePath, 'comp4');
      });
    });
    describe('--dependencies-depth with versionless input', () => {
      it('should resolve the root to head (comp1@0.0.2) and import its direct dep at the referenced version (comp2@0.0.2)', async () => {
        const workspacePath = await importComp1('comp1', { dependencies: true, dependenciesDepth: '1' });
        expectToHaveId(workspacePath, 'comp1', '0.0.2');
        expectToHaveId(workspacePath, 'comp2', '0.0.2');
        expectNotToHaveId(workspacePath, 'comp3');
        expectNotToHaveId(workspacePath, 'comp4');
      });
    });
    describe('--dependencies-head --dependencies-depth 1', () => {
      it('should import the direct dep at head (comp2@0.0.2), not the version comp1@0.0.1 references', async () => {
        const workspacePath = await importComp1('comp1@0.0.1', { dependenciesHead: true, dependenciesDepth: '1' });
        expectToHaveId(workspacePath, 'comp1', '0.0.1');
        expectToHaveId(workspacePath, 'comp2', '0.0.2');
        expectNotToHaveId(workspacePath, 'comp3');
        expectNotToHaveId(workspacePath, 'comp4');
      });
    });
    describe('--dependencies without depth', () => {
      it('should import all transitive dependencies', async () => {
        const workspacePath = await importComp1('comp1@0.0.1', { dependencies: true });
        expectToHaveId(workspacePath, 'comp1', '0.0.1');
        expectToHaveId(workspacePath, 'comp2', '0.0.1');
        expectToHaveId(workspacePath, 'comp3', '0.0.1');
        expectToHaveId(workspacePath, 'comp4', '0.0.1');
      });
    });
    // the validation errors (--dependencies-depth without --dependencies, or not a positive integer) are
    // covered in the importer aspect (import.cmd.spec.ts)
  });

  describe('external package manager mode', () => {
    let importerWorkspacePath: string;
    before(async () => {
      const remote = createWorkspace();
      const { workspacePath } = remote;
      const depResolverId = 'teambit.dependencies/dependency-resolver';
      // a package that "is installed", without running a real installation
      const installIsOdd = (version: string) =>
        fs.outputJsonSync(path.join(workspacePath, 'node_modules/is-odd/package.json'), { name: 'is-odd', version });
      setWorkspaceAspectConfig(workspacePath, depResolverId, { policy: { dependencies: { 'is-odd': '1.0.0' } } });
      installIsOdd('1.0.0');
      await author(remote, { 'global/simple.js': 'const isOdd = require("is-odd")' }, [
        { rootDir: 'global', name: 'global/simple' },
      ]);
      setWorkspaceAspectConfig(workspacePath, depResolverId, { policy: { dependencies: { 'is-odd': '2.0.0' } } });
      installIsOdd('2.0.0');
      await author(
        remote,
        { 'global2/simple.js': 'const isOdd = require("is-odd")' },
        [{ rootDir: 'global2', name: 'global2/simple' }],
        { ids: ['global2/simple'] }
      );

      // a workspace that uses an external package manager
      importerWorkspacePath = createWorkspaceWithRemote(remote).workspacePath;
      setWorkspaceAspectConfig(importerWorkspacePath, depResolverId, {
        externalPackageManager: true,
        rootComponents: false,
      });
      fs.writeJsonSync(path.join(importerWorkspacePath, 'package.json'), { type: 'module' });
      await runImport(
        importerWorkspacePath,
        [`${remote.remoteScopeName}/global/simple`, `${remote.remoteScopeName}/global2/simple`],
        {},
        { externalPackageManager: true }
      );
    });
    it('should write dependencies to package.json', () => {
      const pkgJson = fs.readJsonSync(path.join(importerWorkspacePath, 'package.json'));
      expect(pkgJson.dependencies['is-odd']).to.eq('2.0.0');
    });
    it('should not run installation', () => {
      expect(fs.existsSync(path.join(importerWorkspacePath, 'node_modules/is-odd'))).to.eq(false);
    });
  });
});
