import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import type { Component } from '@teambit/component';
import type { CompIdGraph } from '@teambit/graph';
import { WorkspaceCompiler } from './workspace-compiler';

/**
 * the only members of the aspects the tested methods touch. the rest of the constructor arguments
 * are there because the constructor registers listeners on them.
 */
function createCompiler({
  workspace = {},
  envs = {},
}: {
  workspace?: Record<string, any>;
  envs?: Record<string, any>;
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
    { registerOnPreWatch: () => {} } as any // watcher
  );
}

describe('WorkspaceCompiler.onAspectLoadFail', () => {
  const aspect = { id: ComponentID.fromString('my-org.my-scope/my-aspect') } as Component;

  /**
   * the compilation itself is replaced by a recorder - it needs a workspace on the filesystem, and
   * what is under test is only whether it is triggered at all.
   */
  function createCompilerRecordingCompilation(isWorkspaceComponent: boolean) {
    const compiler = createCompiler({ workspace: { hasId: () => isWorkspaceComponent } });
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
