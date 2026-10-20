import { expect } from 'chai';
import {
  ENV_VAR_FEATURE_TOGGLE,
  SKIP_TAG_CAPSULE_INSTALL,
  reloadFeatureToggle,
} from '@teambit/harmony.modules.feature-toggle';
import { BuilderMain } from './builder.main.runtime';

// Minimal fakes — getPlannedTasks only reads the env of the components and the pipelines of the services.
const task = (aspectId: string, name: string, description?: string) =>
  ({ aspectId, name, description, execute: async () => ({}) }) as any;
const compileTask = task('teambit.compilation/compiler', 'TSCompiler', 'compile components');
const prepareTask = task('teambit.pkg/pkg', 'PreparePackages');
const publishTask = task('teambit.pkg/pkg', 'PublishComponents');
const fakeComponent = (id: string) => ({ id: { toString: () => id, toStringWithoutVersion: () => id } }) as any;
const comp1 = fakeComponent('my-scope/comp1');
const comp2 = fakeComponent('my-scope/comp2');
const compWithoutEnv = fakeComponent('my-scope/comp-without-env');

let buildPipelineCalls = 0;
let throwOnBuildPipeline = false;
const service = (tasks: any[], onCall = () => {}) =>
  ({
    getCurrentPipelinePerEnv: (envDefs: any[]) => {
      onCall();
      return new Map(envDefs.map((env) => [env.id, tasks]));
    },
  }) as any;
const envs = {
  getEnv: (component: any) => {
    if (component === compWithoutEnv) throw new Error('env not found');
    return { id: 'my-env' };
  },
} as any;
const logger = { debug: () => {} } as any;

const builder = new BuilderMain(
  envs,
  undefined as any,
  service([compileTask, prepareTask], () => {
    buildPipelineCalls++;
    if (throwOnBuildPipeline) throw new Error('missing task dependency');
  }),
  service([prepareTask]),
  service([prepareTask, publishTask]),
  undefined as any,
  undefined as any,
  undefined as any,
  undefined as any,
  undefined as any,
  undefined as any,
  undefined as any,
  logger,
  undefined as any
);

describe('BuilderMain', () => {
  describe('getPlannedTasks', () => {
    it('returns the build and snap tasks, listing a task of both pipelines once', () => {
      const plannedTasks = builder.getPlannedTasks([comp1], 'snap').get('my-scope/comp1');
      expect(plannedTasks).to.deep.equal([
        { taskId: 'teambit.compilation/compiler', taskName: 'TSCompiler', taskDescription: 'compile components' },
        { taskId: 'teambit.pkg/pkg', taskName: 'PreparePackages', taskDescription: undefined },
        { taskId: 'teambit.pkg/pkg', taskName: 'PublishComponents', taskDescription: undefined },
      ]);
    });
    it('uses the tag pipeline when not a snap', () => {
      const plannedTasks = builder.getPlannedTasks([comp1], 'tag').get('my-scope/comp1');
      expect(plannedTasks?.map((plannedTask) => plannedTask.taskName)).to.deep.equal(['TSCompiler', 'PreparePackages']);
    });
    it('calculates the pipelines once for all envs and skips components without an env', () => {
      buildPipelineCalls = 0;
      const plannedTasksPerComp = builder.getPlannedTasks([comp1, comp2, compWithoutEnv], 'snap');
      expect(buildPipelineCalls).to.equal(1);
      expect([...plannedTasksPerComp.keys()]).to.deep.equal(['my-scope/comp1', 'my-scope/comp2']);
    });
    it('does not throw when the pipeline cannot be calculated', () => {
      throwOnBuildPipeline = true;
      try {
        expect(builder.getPlannedTasks([comp1], 'snap').size).to.equal(0);
      } finally {
        throwOnBuildPipeline = false;
      }
    });
  });

  describe('shouldSkipCapsuleInstallation', () => {
    const taskRequiring = (aspectId: string, name: string, requiresInstallation: boolean) => ({
      ...task(aspectId, name),
      requiresCapsuleInstallation: () => requiresInstallation,
    });
    const coreExporterTask = taskRequiring('teambit.harmony/aspect', 'CoreExporter', false);
    const packTask = taskRequiring('teambit.pkg/pkg', 'PackComponents', false);
    const appDeployTask = taskRequiring('teambit.harmony/application', 'deploy_application', true);
    const customTask = task('my-scope/my-env', 'MyCustomTask'); // doesn't declare whether it needs the installation
    const pipelineService = (tasks: any[]) => ({ getCurrentPipeline: () => tasks }) as any;
    // the build pipeline has the compiler, which doesn't declare it, but only the teambit.harmony/aspect tasks run.
    const createBuilder = (tagTasks: any[]) =>
      new BuilderMain(
        envs,
        undefined as any,
        pipelineService([compileTask, coreExporterTask]),
        pipelineService(tagTasks),
        pipelineService([]),
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any,
        logger,
        undefined as any
      );
    const shouldSkip = (tagTasks: any[], runTagPipeline = true) =>
      createBuilder(tagTasks)['shouldSkipCapsuleInstallation']([comp1], runTagPipeline ? 'tag' : undefined);

    const originalFeatures = process.env[ENV_VAR_FEATURE_TOGGLE];
    const setFeatures = (features: string) => {
      process.env[ENV_VAR_FEATURE_TOGGLE] = features;
      reloadFeatureToggle();
    };
    beforeEach(() => setFeatures(SKIP_TAG_CAPSULE_INSTALL));
    after(() => {
      if (originalFeatures === undefined) delete process.env[ENV_VAR_FEATURE_TOGGLE];
      else process.env[ENV_VAR_FEATURE_TOGGLE] = originalFeatures;
      reloadFeatureToggle();
    });

    it('skips the installation when none of the running tasks requires it', () => {
      expect(shouldSkip([packTask])).to.be.true;
    });
    it('installs when the feature is disabled', () => {
      setFeatures('another-feature');
      expect(shouldSkip([packTask])).to.be.false;
    });
    it('installs when a task requires it', () => {
      expect(shouldSkip([packTask, appDeployTask])).to.be.false;
    });
    it('installs when a task does not declare whether it requires it', () => {
      expect(shouldSkip([packTask, customTask])).to.be.false;
    });
    it('ignores the tag tasks when the tag pipeline does not run', () => {
      expect(shouldSkip([customTask], false)).to.be.true;
    });
    it('installs when the tasks cannot be determined', () => {
      expect(createBuilder([packTask])['shouldSkipCapsuleInstallation']([compWithoutEnv], 'tag')).to.be.false;
    });
  });
});
