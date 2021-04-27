import R from 'ramda';
import { Graph } from 'cleargraph';
import TesterAspect from '@teambit/tester';
import { EnvDefinition, Environment } from '@teambit/envs';
import { BuildTask, BuildTaskHelper } from './build-task';
import type { TaskSlot } from './builder.main.runtime';
import { TasksQueue } from './tasks-queue';

type TaskDependenciesGraph = Graph<string, string>;
type Location = 'start' | 'middle' | 'end';
type TasksLocationGraph = { location: Location; graph: TaskDependenciesGraph };
type PipelineEnv = { env: EnvDefinition; pipeline: BuildTask[] };
type DataPerLocation = { location: Location; graph: TaskDependenciesGraph; pipelineEnvs: PipelineEnv[] };

/**
 * there are two ways how to add tasks to build pipeline.
 * 1. `getBuildPipe()` method of the env.
 * 2. registering to the `builder.registerBuildTask()`.
 *
 * in the option #1, it's possible to determine the order. e.g. `getBuildPipe() { return [taskA, taskB, taskC]; }`
 * in the option #2, the register happens once the extension is loaded, so there is no way to put
 * one task before/after another task.
 *
 * To be able to determine the order, you can do the following
 * 1. "task.location", it has two options "start" and "end". the rest are "middle".
 * 2. "task.dependencies", the dependencies must be completed for all envs before this task starts.
 * the dependencies are applicable inside a location and not across locations. see getLocation()
 * or/and continue reading for more info about this.
 *
 * to determine the final order of the tasks, the following is done:
 * 1. split all tasks to three groups: start, middle and end.
 * 2. for each group define a dependencies graph for the tasks with "dependencies" prop and the pipeline.
 * 3. start with the first group "start", toposort the dependencies graph and push the found tasks
 * to a queue. once completed, iterate the pipeline and add all tasks to the queue.
 * 4. do the same for the "middle" and "end" groups.
 *
 * the reason for splitting the tasks to the three groups and not using the "dependencies" field
 * alone to determine the order is that the "start" and "end" groups are mostly core and "middle"
 * is mostly the user entering tasks to the pipeline and we as the core don't know about the users
 * tasks. For example, a core task "PublishComponent" must happen after the compiler, however, a
 * user might have an env without a compiler. if we determine the order only by the dependencies
 * field, the "PublishComponent" would have a dependency "compiler" and because in this case there
 * is no compiler task, it would throw an error about missing dependencies.
 */
export function calculatePipelineOrder(
  taskSlot: TaskSlot,
  envs: EnvDefinition[],
  pipeNameOnEnv = 'getBuildPipe',
  tasks: string[] = [],
  skipTests = false
): TasksQueue {
  const graphs: TasksLocationGraph[] = [];
  const locations: Location[] = ['start', 'middle', 'end']; // the order is important here!
  locations.forEach((location) => {
    graphs.push({ location, graph: new Graph<string, string>() });
  });
  const pipelineEnvs: PipelineEnv[] = [];
  envs.forEach((envDefinition) => {
    if (envDefinition.env.getPipe) {
      // @todo: remove once this confusion is over
      throw new Error(
        `Fatal: a breaking API has introduced. Please change "getPipe()" method on "${envDefinition.id}" to "getBuildPipe()"`
      );
    }
    const pipeline = getPipelineForEnv(taskSlot, envDefinition.env, pipeNameOnEnv);
    pipelineEnvs.push({ env: envDefinition, pipeline });
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
  if (tasks.length) {
    return new TasksQueue(
      ...tasksQueue.filter(({ task }) => tasks.includes(task.name) || tasks.includes(task.aspectId))
    );
  }
  if (skipTests) {
    return new TasksQueue(...tasksQueue.filter(({ task }) => task.aspectId !== TesterAspect.id));
  }
  return tasksQueue;
}

function addTasksToGraph(tasksQueue: TasksQueue, dataPerLocation: DataPerLocation[], location: Location) {
  const data = dataPerLocation.find((d) => d.location === location);
  if (!data) return;
  const sorted = data.graph.toposort();
  sorted.forEach((taskNode) => {
    const { aspectId, name } = BuildTaskHelper.deserializeId(taskNode.attr);
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

/**
 * since the task execution is happening per group: "start", "middle" and "end", the dependencies
 * need to be inside the same group.
 * e.g. if a dependency located at "end" group and the task located at "start", it's impossible to
 * complete the dependency before the task, there it throws an error.
 * it's ok to have the dependency located earlier, e.g. "start" and the task at "end", and in this
 * case, it will not be part of the graph because there is no need to do any special calculation.
 */
function getLocation(task: BuildTask, dependencyTask: BuildTask): Location | null {
  const taskLocation = task.location || 'middle';
  const dependencyLocation = dependencyTask.location || 'middle';

  const isDependencyAhead =
    (taskLocation === 'start' && dependencyLocation !== 'start') ||
    (taskLocation === 'middle' && dependencyLocation === 'end');

  const isDependencyEqual = taskLocation === dependencyLocation;

  if (isDependencyAhead) {
    throw new Error(`a task "${BuildTaskHelper.serializeId(task)}" located at ${taskLocation}
has a dependency "${BuildTaskHelper.serializeId(dependencyTask)} located at ${dependencyLocation},
which is invalid. the dependency must be located earlier or in the same location as the task"`);
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
  const slotsTasks = R.flatten(taskSlot.values());
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
