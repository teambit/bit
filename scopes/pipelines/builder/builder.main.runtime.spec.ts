import { expect } from 'chai';
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
const service = (tasks: any[], onCall = () => {}) =>
  ({
    getCurrentPipeline: () => {
      onCall();
      return tasks;
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
  service([compileTask, prepareTask], () => buildPipelineCalls++),
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
    it('calculates the pipelines once per env and skips components without an env', () => {
      buildPipelineCalls = 0;
      const plannedTasksPerComp = builder.getPlannedTasks([comp1, comp2, compWithoutEnv], 'snap');
      expect(buildPipelineCalls).to.equal(1);
      expect([...plannedTasksPerComp.keys()]).to.deep.equal(['my-scope/comp1', 'my-scope/comp2']);
    });
  });
});
