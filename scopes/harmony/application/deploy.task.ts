import mapSeries from 'p-map-series';
import { BuilderMain, BuildTask, BuildContext, ComponentResult, TaskResults } from '@teambit/builder';
import { ComponentID } from '@teambit/component';
import { ApplicationAspect } from './application.aspect';
import { ApplicationMain } from './application.main.runtime';
import { BUILD_TASK } from './build.task';
import { AppDeployContext } from './app-deploy-context';

export const DEPLOY_TASK = 'deploy_application';

export class DeployTask implements BuildTask {
  name = DEPLOY_TASK;
  aspectId = ApplicationAspect.id;
  readonly location = 'end';
  constructor(private application: ApplicationMain, private builder: BuilderMain) {}

  async execute(context: BuildContext): Promise<any> {
    const apps = this.application.listApps();
    const componentsResults = await mapSeries(apps, async (app): Promise<any> => {
      const aspectId = this.application.getAppAspect(app.name);
      if (!aspectId) return undefined;
      const capsule = context.capsuleNetwork.seedersCapsules.getCapsuleIgnoreVersion(ComponentID.fromString(aspectId));
      if (!capsule || !capsule?.component) return undefined;
      const buildTask = this.getBuildTask(context.previousTasksResults, context.envRuntime.id);
      if (!buildTask) return undefined;
      const componentResults = buildTask.componentsResults.find((res) =>
        res.component.id.isEqual(capsule.component.id, { ignoreVersion: true })
      );
      /**
       * @guysaar223
       * @ram8
       * TODO: we need to think how to pass private metadata between build pipes, maybe create shared context
       * or create new deploy context on builder
       */
      // @ts-ignore
      const _metadata = componentResults?._metadata?.deployContext || {};
      const appDeployContext: AppDeployContext = Object.assign(context, _metadata, {
        capsule,
        appComponent: capsule.component,
      });
      if (!app.deploy) return undefined;
      await app.deploy(appDeployContext);

      return {
        componentResult: { component: capsule.component },
      };
    });

    const _componentsResults = componentsResults
      .map((res) => {
        return res?.componentResult;
      })
      .filter((a) => !!a) as ComponentResult[];

    return {
      componentsResults: _componentsResults,
    };
  }

  private getBuildTask(taskResults: TaskResults[], runtime: string) {
    return taskResults.find(
      ({ task, env }) => task.aspectId === ApplicationAspect.id && task.name === BUILD_TASK && env.id === runtime
    );
  }
}
