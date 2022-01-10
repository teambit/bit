import mapSeries from 'p-map-series';
import { Capsule } from '@teambit/isolator';
import { BuilderMain, BuildTask, BuildContext, ComponentResult, TaskResults } from '@teambit/builder';
import { ComponentID } from '@teambit/component';
import { ApplicationAspect } from './application.aspect';
import { ApplicationMain } from './application.main.runtime';
import { BUILD_TASK } from './build.task';
import { DeployContext } from './deploy-context';

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
      const capsules = context.capsuleNetwork.seedersCapsules;
      const capsule = this.getCapsule(capsules, aspectId);
      if (!capsule?.component) return undefined;
      const buildTask = this.getBuildTask(context.previousTasksResults, context.envRuntime.id);
      if (!buildTask) return undefined;
      const componentArtifacts = buildTask.artifacts?.get(capsule.component);
      const artifactList = componentArtifacts?.[1];
      if (!artifactList) return undefined;
      const deployContext: DeployContext = Object.assign(context, { artifactList });
      if (!capsule || !app.deploy) return undefined;
      await app.deploy(deployContext, capsule);

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

  private getCapsule(capsules: Capsule[], aspectId: string) {
    const aspectCapsuleId = ComponentID.fromString(aspectId).toStringWithoutVersion();
    return capsules.find((capsule) => capsule.component.id.toStringWithoutVersion() === aspectCapsuleId);
  }
}
