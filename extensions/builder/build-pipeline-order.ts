import { Environment } from '@teambit/environments';
import { Runtime } from '@teambit/environments/runtime';
import { BuildTask } from './build-task';
import type { TaskSlot } from './builder.main.runtime';

export function figureOrder(taskSlot: TaskSlot, envs: Runtime, pipeNameOnEnv = 'getBuildPipe') {
  envs.runtimeEnvs.forEach((runtimeEnv) => {
    const pipeline = getPipelineForEnv(taskSlot, runtimeEnv.env, pipeNameOnEnv);
    console.log(
      'figureOrder -> pipeline',
      runtimeEnv.id,
      'total tasks',
      pipeline.length,
      'total components: ',
      runtimeEnv.components.length
    );
    pipeline.forEach((task) => {
      console.log('task details', task.id, task.name, task.description);
    });
  });
  throw new Error('stop here');
}

function getPipelineForEnv(taskSlot: TaskSlot, env: Environment, pipeNameOnEnv: string): BuildTask[] {
  const buildTasks: BuildTask[] = env[pipeNameOnEnv] ? env[pipeNameOnEnv]() : [];

  // TODO: refactor end and start task execution to a separate method
  const slotsTasks = taskSlot.values();
  const tasksAtStart: BuildTask[] = [];
  const tasksAtEnd: BuildTask[] = [];
  // @todo: develop a better mechanism. e.g. I want "preview" and "publish" to be in the end
  // but preview before publish. in Drupal for example this is resolved by a numeric "weight" field
  slotsTasks.forEach((task) => {
    if (task.location === 'start') {
      tasksAtStart.push(task);
      return;
    }
    if (task.location === 'end') {
      tasksAtEnd.push(task);
      return;
    }
    tasksAtStart.push(task);
  });

  // merge with extension registered tasks.
  const mergedTasks = [...tasksAtStart, ...buildTasks, ...tasksAtEnd];

  return mergedTasks;
}
