import { Logger } from '@teambit/logger';
import Bluebird from 'bluebird';
import prettyTime from 'pretty-time';
import { ArtifactList } from './artifact';
import { BuilderMain, StorageResolverSlot } from './builder.main.runtime';
import { InvalidTask } from './exceptions';
import { TaskProcess } from './task-process';
import { BuildContext, BuildResults, BuildTask } from './types';

export class BuildPipe {
  constructor(
    /**
     * array of services to apply on the components.
     */
    readonly tasks: BuildTask[],
    readonly logger: Logger,
    /**
     * slot containing all storage resolvers.
     */
    private storageResolverSlot: StorageResolverSlot
  ) {}

  /**
   * execute a pipeline of build tasks.
   */
  async execute(buildContext: BuildContext): Promise<BuildResults[]> {
    const longProcessLogger = this.logger.createLongProcessLogger('running tasks', this.tasks.length);
    const results = await Bluebird.mapSeries(this.tasks, async (task: BuildTask) => {
      if (!task) {
        throw new InvalidTask(task);
      }
      const taskName = `${task.id} ${task.description || ''}`;
      longProcessLogger.logProgress(taskName);
      const startTask = process.hrtime();
      const taskResult = await task.execute(buildContext);
      const taskProcess = new TaskProcess(task, taskResult, buildContext, this.logger);
      taskProcess.throwIfErrorsFound();
      const duration = prettyTime(process.hrtime(startTask));
      this.logger.consoleSuccess(`task "${taskName}" has completed successfully in ${duration}`);
      const artifactsProps = taskResult.artifacts || [];
      const artifactList = ArtifactList.create(artifactsProps, this.storageResolverSlot.values());

      await taskProcess.saveTaskResults();
      return taskResult;
    });
    longProcessLogger.end();
    return results;
  }

  /**
   * create a build pipe from an array of tasks.
   */
  static from(tasks: BuildTask[], logger: Logger, storageResolverSlot: StorageResolverSlot) {
    return new BuildPipe(tasks, logger, storageResolverSlot);
  }
}
