import { EnvDefinition } from '@teambit/envs';
import { BuildTask, BuildTaskHelper } from './build-task';
import { InvalidTask } from './exceptions';

type EnvTask = { env: EnvDefinition; task: BuildTask };

export class TasksQueue extends Array<EnvTask> {
  toString() {
    return this.map(({ env, task }) => `env ${env.id}, task ${BuildTaskHelper.serializeId(task)}`).join('\n');
  }
  /**
   * make sure tasks names are valid and there are no duplications
   */
  validate() {
    this.forEach(({ task }) => {
      this.validateTaskName(task);
    });
    this.validateDuplications();
  }

  private validateTaskName(task: BuildTask) {
    if (!task.name) throw new InvalidTask(task.aspectId, 'name is missing');
    const regexWord = /^\w+$/; // match any word: a-zA-Z0-9 and underscore.
    const isValid = regexWord.test(task.name);
    if (!isValid)
      throw new InvalidTask(task.aspectId, `name "${task.name}" is invalid, only alphanumeric characters are allowed`);
  }

  private validateDuplications() {
    const uniqueTasks = this.map(({ env, task }) => `${env.id} ${task.aspectId}:${task.name}`);
    uniqueTasks.forEach((uniqTask) => {
      if (uniqueTasks.filter((u) => u === uniqTask).length > 1) {
        throw new InvalidTask(
          uniqTask,
          'there are two or more tasks with the same name and aspectId in the same environment'
        );
      }
    });
  }
}
