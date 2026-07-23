import { expect } from 'chai';
import Module from 'module';
import { BuildPipe } from './build-pipe';
import type { BuildTask, BuiltTaskResult } from './build-task';

// minimal fakes — executeTask only reads the logger methods below, a build-context holding a
// capsule-network, and an artifact factory invoked on success.
const logger = {
  setStatusLine: () => {},
  debug: () => {},
  consoleFailure: () => {},
  consoleSuccess: () => {},
  createLongProcessLogger: () => ({ logProgress: () => {}, end: () => {}, getProgress: () => '' }),
} as any;

const artifactFactory = { generate: () => undefined } as any;

const env = { id: 'teambit.harmony/node' } as any;

function makeEnvsBuildContext() {
  return {
    [env.id]: {
      capsuleNetwork: {
        _originalSeeders: [],
        capsulesRootDir: '/tmp/build-pipe-spec',
        seedersCapsules: { getAllComponents: () => [] },
      },
    },
  } as any;
}

const emptyResult = (): BuiltTaskResult => ({ componentsResults: [], artifacts: [] });

function makeTask(name: string, execute: () => Promise<BuiltTaskResult>): BuildTask {
  return { aspectId: 'teambit.pipelines/builder', name, execute } as any;
}

describe('BuildPipe require-extensions isolation', () => {
  let extensionsSnapshot: Record<string, any>;
  beforeEach(() => {
    extensionsSnapshot = { ...(Module as any)._extensions };
  });
  afterEach(() => {
    // a failing assertion must not leave the test process with hijacked loaders
    const extensions = (Module as any)._extensions;
    for (const key of Object.keys(extensions)) {
      if (!(key in extensionsSnapshot)) delete extensions[key];
    }
    Object.assign(extensions, extensionsSnapshot);
  });

  it('confines require-extension hooks installed by a task to that task', async () => {
    const originalJsLoader = (Module as any)._extensions['.js'];
    // mimics what @babel/register (via pirates) leaves behind when a tester runs in-process:
    // a loader that claims ".js" files and compiles them itself
    const hijackingLoader = () => {
      throw new Error('hijacked');
    };
    const hijackingTask = makeTask('hijack', async () => {
      (Module as any)._extensions['.js'] = hijackingLoader;
      (Module as any)._extensions['.fake-ext'] = hijackingLoader;
      return emptyResult();
    });
    let jsLoaderDuringNextTask: any;
    let fakeExtExistsDuringNextTask: boolean | undefined;
    const observingTask = makeTask('observe', async () => {
      jsLoaderDuringNextTask = (Module as any)._extensions['.js'];
      fakeExtExistsDuringNextTask = '.fake-ext' in (Module as any)._extensions;
      return emptyResult();
    });
    const queue = [
      { task: hijackingTask, env },
      { task: observingTask, env },
    ] as any;

    const pipe = new BuildPipe(queue, makeEnvsBuildContext(), logger, artifactFactory);
    await pipe.execute();

    expect(jsLoaderDuringNextTask).to.equal(originalJsLoader);
    expect(fakeExtExistsDuringNextTask).to.be.false;
    expect((Module as any)._extensions['.js']).to.equal(originalJsLoader);
  });

  it('restores hooks even when the task fails', async () => {
    const originalJsLoader = (Module as any)._extensions['.js'];
    const failingHijackingTask = makeTask('hijack-and-fail', async () => {
      (Module as any)._extensions['.js'] = () => {
        throw new Error('hijacked');
      };
      throw new Error('task failed');
    });
    const queue = [{ task: failingHijackingTask, env }] as any;

    const pipe = new BuildPipe(queue, makeEnvsBuildContext(), logger, artifactFactory);
    await pipe.execute().catch(() => {});

    expect((Module as any)._extensions['.js']).to.equal(originalJsLoader);
  });
});
