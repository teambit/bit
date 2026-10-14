import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import type { Component } from '@teambit/component';
import type { CompIdGraph } from '@teambit/graph';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { ComponentCompiler, WorkspaceCompiler } from './workspace-compiler';

/**
 * the only members of the aspects the tested methods touch. the rest of the constructor arguments
 * are there because the constructor registers listeners on them.
 */
function createCompiler({
  workspace = {},
  envs = {},
  installRunningElsewhere,
}: {
  workspace?: Record<string, any>;
  envs?: Record<string, any>;
  installRunningElsewhere?: { pid: number };
}) {
  const workspaceStub = {
    registerOnComponentChange: () => {},
    registerOnComponentAdd: () => {},
    inInstallContext: false,
    inInstallAfterPmContext: false,
    hasId: () => true,
    ...workspace,
  };
  return new WorkspaceCompiler(
    workspaceStub as any,
    envs as any,
    {} as any, // pubsub
    undefined as any, // aspectLoader. when absent, the constructor skips its listener registration
    { registerPreStart: () => {} } as any, // ui
    { debug: () => {} } as any, // logger
    {} as any, // dependencyResolver
    {
      registerOnPreWatch: () => {},
      ipcEvents: { getInstallRunningElsewhere: async () => installRunningElsewhere },
    } as any // watcher
  );
}

describe('WorkspaceCompiler.onAspectLoadFail', () => {
  const aspect = { id: ComponentID.fromString('my-org.my-scope/my-aspect') } as Component;

  /**
   * the compilation itself is replaced by a recorder - it needs a workspace on the filesystem, and
   * what is under test is only whether it is triggered at all.
   */
  function createCompilerRecordingCompilation(
    isWorkspaceComponent: boolean,
    installRunningElsewhere?: { pid: number }
  ) {
    const compiler = createCompiler({ workspace: { hasId: () => isWorkspaceComponent }, installRunningElsewhere });
    const compiled: string[][] = [];
    compiler.getEnvDepsGraph = async () => ({ graph: undefined as unknown as CompIdGraph, successors: [] });
    compiler.compileComponents = async (ids) => {
      compiled.push(ids as string[]);
      return [];
    };
    return { compiler, compiled };
  }

  it('should compile a workspace component that failed to load', async () => {
    const { compiler, compiled } = createCompilerRecordingCompilation(true);
    const err = Object.assign(new Error('Cannot find module'), { code: 'MODULE_NOT_FOUND' });
    expect(await compiler.onAspectLoadFail(err, aspect)).to.be.true;
    expect(compiled).to.deep.equal([['my-org.my-scope/my-aspect']]);
  });

  it('should compile when node refuses to strip the types of a ts file under node_modules', async () => {
    const { compiler, compiled } = createCompilerRecordingCompilation(true);
    const err = Object.assign(new Error('Stripping types is currently unsupported for files under node_modules'), {
      code: 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING',
    });
    expect(await compiler.onAspectLoadFail(err, aspect)).to.be.true;
    expect(compiled).to.have.lengthOf(1);
  });

  it('should not compile an aspect that is not a workspace component', async () => {
    const { compiler, compiled } = createCompilerRecordingCompilation(false);
    const err = Object.assign(new Error('Cannot find module'), { code: 'MODULE_NOT_FOUND' });
    expect(await compiler.onAspectLoadFail(err, aspect)).to.be.false;
    expect(compiled).to.be.empty;
  });

  it('should not compile on an error that compiling cannot fix', async () => {
    const { compiler, compiled } = createCompilerRecordingCompilation(true);
    const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    expect(await compiler.onAspectLoadFail(err, aspect)).to.be.false;
    expect(compiled).to.be.empty;
  });

  it('should not compile while another process is installing', async () => {
    const { compiler, compiled } = createCompilerRecordingCompilation(true, { pid: 12345 });
    const err = Object.assign(new Error('Cannot find module'), { code: 'MODULE_NOT_FOUND' });
    expect(await compiler.onAspectLoadFail(err, aspect)).to.be.false;
    expect(compiled).to.be.empty;
  });
});

describe('WorkspaceCompiler.buildGroupsToCompile', () => {
  const compId = 'my-org.my-scope/my-comp';
  const envId = 'my-org.my-scope/my-env';
  // the env of the env. installed as a package, hence not a node on the workspace graph
  const envOfEnvId = 'my-org.installed/my-env-of-env';
  const envIdOf = { [compId]: envId, [envId]: envOfEnvId };

  const component = (idStr: string) => ({ id: ComponentID.fromString(idStr) }) as Component;

  const envs = {
    calculateEnvId: async (comp: Component) => ComponentID.fromString(envIdOf[comp.id.toString()]),
    isEnv: (comp: Component) => comp.id.toString() === envId,
    isCoreEnv: () => false,
  };

  /** mimics cleargraph, which throws when asked for the successors of a node it does not have */
  const graph = {
    hasNode: (id: string) => id === compId || id === envId,
    successorsSubgraph: (ids: string[]) => {
      const missing = ids.find((id) => !graph.hasNode(id));
      if (missing) throw new Error(`Node ${missing} does not exist on graph`);
      return { nodes: [] };
    },
  } as unknown as CompIdGraph;

  type Group = Awaited<ReturnType<WorkspaceCompiler['buildGroupsToCompile']>>[number];

  it('should skip env ids that are not on the given graph', async () => {
    const compiler = createCompiler({ envs });
    const groups = await compiler.buildGroupsToCompile([component(compId), component(envId)], graph);
    const idsOfGroup = (key: keyof Omit<Group, 'components'>) =>
      groups.find((group) => group[key])!.components.map((comp) => comp.id.toString());
    expect(idsOfGroup('envs')).to.deep.equal([envId]);
    expect(idsOfGroup('other')).to.deep.equal([compId]);
    expect(idsOfGroup('depsOfEnvsOfEnvs')).to.be.empty;
  });
});

describe('ComponentCompiler.removeDistsOfRemovedFiles', () => {
  let workspacePath: string;
  let compDir: string;
  let distDir: string;
  const distFiles = ['foo.js', 'foo.js.map', 'foo.d.ts', 'bar.js', 'bar.js.map'];

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'comp-compiler-'));
    compDir = path.join(workspacePath, 'my-comp');
    distDir = path.join('node_modules', '@my-org', 'my-comp', 'dist');
    await fs.ensureDir(compDir);
    await Promise.all(distFiles.map((file) => fs.outputFile(path.join(workspacePath, distDir, file), '')));
  });
  afterEach(() => fs.remove(workspacePath));

  function removeDists(removedFiles: string[]) {
    const workspace = { path: workspacePath, componentDir: () => compDir };
    const compilerInstance = {
      getDistDir: () => 'dist',
      getDistPathBySrcPath: (srcPath: string) => path.join('dist', srcPath.replace(/\.tsx?$/, '.js')),
    };
    const component = { id: ComponentID.fromString('my-org.my-scope/my-comp') };
    const componentCompiler = new ComponentCompiler(
      {} as any,
      workspace as any,
      component as any,
      compilerInstance as any,
      'my-compiler',
      {} as any,
      {} as any
    );
    return (componentCompiler as any).removeDistsOfRemovedFiles(removedFiles, [distDir]);
  }
  const existingDists = async () =>
    (await fs.readdir(path.join(workspacePath, distDir))).sort((first, second) => first.localeCompare(second));

  it('should delete only the dists of the removed source file', async () => {
    await removeDists([path.join(compDir, 'foo.ts')]);
    expect(await existingDists()).to.deep.equal(['bar.js', 'bar.js.map']);
  });

  it('should delete nothing for a removed file that was never compiled, such as a temp file of an atomic save', async () => {
    await removeDists([path.join(compDir, '.foo.ts.tmp-1234')]);
    expect(await existingDists()).to.have.lengthOf(distFiles.length);
  });

  it('should keep the dists of a file that was re-created meanwhile', async () => {
    await fs.outputFile(path.join(compDir, 'foo.ts'), '');
    await removeDists([path.join(compDir, 'foo.ts')]);
    expect(await existingDists()).to.have.lengthOf(distFiles.length);
  });
});
