import { expect } from 'chai';
import { calculatePipelineOrder, isTaskInFilter } from './build-pipeline-order';

// Minimal fakes — calculatePipelineOrder only reads the env's pipe function and the slot's values.
const task = (aspectId: string, name: string) => ({ aspectId, name, execute: async () => ({}) }) as any;
const compileTask = task('teambit.compilation/compiler', 'TSCompiler');
const appTask = task('teambit.harmony/application', 'build_application');
const emptySlot = { values: () => [] } as any;
const envs = [{ id: 'my-env', env: { getBuildPipe: () => [compileTask, appTask] } }] as any;

const queuedTaskNames = (tasks: string[] = [], skipTasks: string[] = []) =>
  calculatePipelineOrder(emptySlot, envs, 'getBuildPipe', tasks, false, skipTasks).map(
    ({ task: queuedTask }) => queuedTask.name
  );

describe('build-pipeline-order', () => {
  describe('isTaskInFilter', () => {
    it('matches by task-name, task-aspect-id and the full task-id', () => {
      expect(isTaskInFilter(appTask, ['build_application'])).to.be.true;
      expect(isTaskInFilter(appTask, ['teambit.harmony/application'])).to.be.true;
      expect(isTaskInFilter(appTask, ['teambit.harmony/application:build_application'])).to.be.true;
    });
    it('does not match a full task-id of a different task in the same aspect', () => {
      expect(isTaskInFilter(appTask, ['teambit.harmony/application:other_task'])).to.be.false;
    });
  });

  describe('calculatePipelineOrder', () => {
    it('filters the pipeline by the full task-id', () => {
      expect(queuedTaskNames(['teambit.harmony/application:build_application'])).to.deep.equal(['build_application']);
    });
    it('skips tasks by the full task-id', () => {
      expect(queuedTaskNames([], ['teambit.harmony/application:build_application'])).to.deep.equal(['TSCompiler']);
    });
    it('returns an empty queue when no task matches the filter', () => {
      // the filter may target another pipeline. BuilderMain.build() validates it across the pipelines
      expect(queuedTaskNames(['non-exist'])).to.deep.equal([]);
    });
  });
});
