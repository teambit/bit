import { expect } from 'chai';
import { BuilderMain } from './builder.main.runtime';

// Minimal fakes — getPlannedTasks only reads the env of the component and the pipelines of the services.
const task = (aspectId: string, name: string, description?: string) =>
  ({ aspectId, name, description, execute: async () => ({}) }) as any;
const compileTask = task('teambit.compilation/compiler', 'TSCompiler', 'compile components');
const prepareTask = task('teambit.pkg/pkg', 'PreparePackages');
const publishTask = task('teambit.pkg/pkg', 'PublishComponents');
const service = (tasks: any[]) => ({ getCurrentPipeline: () => tasks }) as any;
const envs = { getEnv: () => ({ id: 'my-env' }) } as any;

const builder = new BuilderMain(
  envs,
  undefined as any,
  service([compileTask, prepareTask]),
  service([prepareTask]),
  service([prepareTask, publishTask]),
  undefined as any,
  undefined as any,
  undefined as any,
  undefined as any,
  undefined as any,
  undefined as any,
  undefined as any,
  undefined as any,
  undefined as any
);

describe('BuilderMain', () => {
  describe('getPlannedTasks', () => {
    it('returns the build and snap tasks, listing a task of both pipelines once', () => {
      const report = builder.getPlannedTasks({} as any, true);
      expect(report).to.deep.equal([
        {
          taskId: 'teambit.compilation/compiler',
          taskName: 'TSCompiler',
          taskDescription: 'compile components',
        },
        { taskId: 'teambit.pkg/pkg', taskName: 'PreparePackages', taskDescription: undefined },
        { taskId: 'teambit.pkg/pkg', taskName: 'PublishComponents', taskDescription: undefined },
      ]);
    });
    it('uses the tag pipeline when not a snap', () => {
      const report = builder.getPlannedTasks({} as any);
      expect(report.map((r) => r.taskName)).to.deep.equal(['TSCompiler', 'PreparePackages']);
    });
  });
});
