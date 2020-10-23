import R from 'ramda';
import { Graph } from 'cleargraph';
import { Environment } from '@teambit/environments';
import { EnvRuntime } from '@teambit/environments/runtime';
import { BuildTask, BuildTaskHelper } from './build-task';
import type { TaskSlot } from './builder.main.runtime';
import { TasksQueue } from './tasks-queue';

type TaskDependenciesGraph = Graph<string, string>;
type Location = 'start' | 'middle' | 'end';
type TasksLocationGraph = { location: Location; graph: TaskDependenciesGraph };
type PipelineEnv = { env: EnvRuntime; pipeline: BuildTask[] };
type DataPerLocation = { location: Location; graph: TaskDependenciesGraph; pipelineEnvs: PipelineEnv[] };

/**
 * there are two ways how to add tasks to build pipeline.
 * 1. `getBuildPipe()` method of the env.
 * 2. registering to the `builder.registerBuildTask()`.
 *
 * in the option #1, it's possible to determine the order. e.g. `getBuildPipe() { return [taskA, taskB, taskC]; }`
 * in the option #2, the register happens once the extension is loaded and it's hard to determine
 * when it's happening.
 * There are two ways to determine the order.
 * 1. "task.location", it has two options "start" and "end". the rest are "middle".
 * 2. "task.dependencies", the dependencies must be completed for all envs before this task starts.
 * the dependencies are applicable inside a location and not across locations.
 *
 * to determine the final order of the tasks, the following is done:
 * 1. split all tasks to three groups: start, middle and end.
 * 2. for each group define a dependencies graph for the tasks with "dependencies" prop and the pipeline.
 * 3. start with the first group "start", toposort the dependencies graph and push the found tasks
 * to a queue. once completed, iterate the pipeline and add all tasks to the queue.
 * 4. do the same for the "middle" and "end" groups.
 */
export function calculatePipelineOrder(
  taskSlot: TaskSlot,
  envs: EnvRuntime[],
  pipeNameOnEnv = 'getBuildPipe'
): TasksQueue {
  const graphs: TasksLocationGraph[] = [];
  const locations: Location[] = ['start', 'middle', 'end']; // the order is important here!
  locations.forEach((location) => {
    graphs.push({ location, graph: new Graph<string, string>() });
  });
  const pipelineEnvs: PipelineEnv[] = [];
  envs.forEach((envRuntime) => {
    if (envRuntime.env.getPipe) {
      // @todo: remove once this confusion is over
      throw new Error(
        `Fatal: a breaking API has introduced. Please change "getPipe()" method on "${envRuntime.id}" to "getBuildPipe()"`
      );
    }
    const pipeline = getPipelineForEnv(taskSlot, envRuntime.env, pipeNameOnEnv);
    pipelineEnvs.push({ env: envRuntime, pipeline });
  });

  const flattenedPipeline: BuildTask[] = R.flatten(pipelineEnvs.map((pipelineEnv) => pipelineEnv.pipeline));
  flattenedPipeline.forEach((task) => addDependenciesToGraph(graphs, flattenedPipeline, task));

  const dataPerLocation: DataPerLocation[] = graphs.map(({ location, graph }) => {
    const pipelineEnvsPerLocation: PipelineEnv[] = pipelineEnvs.map(({ env, pipeline }) => {
      return { env, pipeline: pipeline.filter((task) => (task.location || 'middle') === location) };
    });
    return { location, graph, pipelineEnvs: pipelineEnvsPerLocation };
  });

  const tasksQueue = new TasksQueue();
  locations.forEach((location) => addTasksToGraph(tasksQueue, dataPerLocation, location));
  return tasksQueue;
}

function addTasksToGraph(tasksQueue: TasksQueue, dataPerLocation: DataPerLocation[], location: Location) {
  const data = dataPerLocation.find((d) => d.location === location);
  if (!data) return;
  const sorted = data.graph.toposort();
  sorted.forEach((taskId) => {
    const { aspectId, name } = BuildTaskHelper.deserializeId(taskId);
    data.pipelineEnvs.forEach(({ env, pipeline }) => {
      const taskIndex = pipeline.findIndex(
        (pipelineTask) => pipelineTask.aspectId === aspectId && pipelineTask.name === name
      );
      if (taskIndex < 0) return;
      const task = pipeline[taskIndex];
      tasksQueue.push({ env, task });
      pipeline.splice(taskIndex, 1); // delete the task from the pipeline
    });
  });
  data.pipelineEnvs.forEach(({ env, pipeline }) => {
    pipeline.forEach((task) => tasksQueue.push({ env, task }));
  });
}

function addDependenciesToGraph(graphs: TasksLocationGraph[], pipeline: BuildTask[], task: BuildTask) {
  if (!task.dependencies || !task.dependencies.length) return;
  const taskId = BuildTaskHelper.serializeId(task);
  task.dependencies.forEach((dependency) => {
    const { aspectId, name } = BuildTaskHelper.deserializeId(dependency);
    const dependencyTasks = pipeline.filter((pipelineTask) => {
      if (pipelineTask.aspectId !== aspectId) return false;
      return name ? name === pipelineTask.name : true;
    });
    if (dependencyTasks.length === 0) {
      throw new Error(
        `unable to find dependency "${dependency}" of "${BuildTaskHelper.serializeId(task)}" in the pipeline`
      );
    }
    dependencyTasks.forEach((dependencyTask) => {
      const location = getLocation(task, dependencyTask);
      if (!location) {
        // the dependency is behind and will be in the correct order regardless the graph.
        return;
      }
      const graphLocation = graphs.find((g) => g.location === location);
      if (!graphLocation) throw new Error(`unable to find graph for location ${location}`);
      const dependencyId = BuildTaskHelper.serializeId(dependencyTask);
      const graph = graphLocation.graph;
      graph.setNode(taskId, taskId);
      graph.setNode(dependencyId, dependencyId);
      graph.setEdge(dependencyId, taskId, 'dependency');
    });
  });
}

function getLocation(task: BuildTask, dependencyTask: BuildTask): Location | null {
  const taskLocation = task.location || 'middle';
  const dependencyLocation = dependencyTask.location || 'middle';

  const isDependencyAhead =
    (taskLocation === 'start' && dependencyLocation !== 'start') ||
    (taskLocation === 'middle' && dependencyLocation === 'end');

  const isDependencyEqual = taskLocation === dependencyLocation;

  if (isDependencyAhead) {
    throw new Error(``);
  }

  if (isDependencyEqual) {
    return taskLocation;
  }

  // dependency is behind. e.g. task is "end" and dependency is "start". no need to enter to the
  // graph as it's going to be executed in the right order regardless the graph.
  return null;
}

function getPipelineForEnv(taskSlot: TaskSlot, env: Environment, pipeNameOnEnv: string): BuildTask[] {
  const buildTasks: BuildTask[] = env[pipeNameOnEnv] ? env[pipeNameOnEnv]() : [];
  const slotsTasks = taskSlot.values();
  const tasksAtStart: BuildTask[] = [];
  const tasksAtEnd: BuildTask[] = [];
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
