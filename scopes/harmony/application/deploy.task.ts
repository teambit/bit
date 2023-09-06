import mapSeries from 'p-map-series';
import { BuilderMain, BuildTask, BuildContext, ComponentResult, TaskResults, BuiltTaskResult } from '@teambit/builder';
import { compact } from 'lodash';
import { Capsule } from '@teambit/isolator';
import { Component, ComponentID } from '@teambit/component';
import { ApplicationAspect } from './application.aspect';
import { ApplicationMain } from './application.main.runtime';
import { BUILD_TASK } from './build-application.task';
import { AppDeployContext } from './app-deploy-context';
import { Application } from './application';

export const DEPLOY_TASK = 'deploy_application';

export class DeployTask implements BuildTask {
  name = DEPLOY_TASK;
  aspectId = ApplicationAspect.id;
  readonly location = 'end';
  constructor(private application: ApplicationMain, private builder: BuilderMain) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const originalSeedersIds = context.capsuleNetwork.originalSeedersCapsules.map((c) => c.component.id.toString());
    const { capsuleNetwork } = context;

    const components = await mapSeries(capsuleNetwork.originalSeedersCapsules, async (capsule) => {
      const component = capsule.component;
      if (originalSeedersIds && originalSeedersIds.length && !originalSeedersIds.includes(component.id.toString())) {
        return undefined;
      }
      const apps = await this.application.loadAppsFromComponent(component, capsule.path);
      if (!apps || !apps.length) return undefined;
      await mapSeries(compact(apps), async (app) => this.runForOneApp(app, capsule, context));
      return component;
    });

    const _componentsResults: ComponentResult[] = compact(components).map((component) => {
      return { component };
    });

    return {
      componentsResults: _componentsResults,
    };
  }

  private async runForOneApp(app: Application, capsule: Capsule, context: BuildContext): Promise<void> {
    const aspectId = this.application.getAppAspect(app.name);
    if (!aspectId) return;

    if (!capsule || !capsule?.component) return;

    const buildTask = this.getBuildTask(context.previousTasksResults, context.envRuntime.id);

    const metadata = buildTask
      ? this.getBuildMetadata(buildTask as TaskResults, capsule.component.id, app)
      : this.getBuildMetadataFromCompObject(capsule.component, app);

    if (!metadata) return;

    /**
     * types are terrible here. an example of the metadata is:
     * {
          publicDir: 'artifacts/apps/react-common-js/bit-dev/public',
          ssrPublicDir: 'artifacts/apps/react-common-js/bit-dev'
        },
        name: 'bit-dev',
        appType: 'react-common-js'
      }
     */

    const appDeployContext: AppDeployContext = Object.assign(context, metadata.deployContext, {
      capsule,
      appComponent: capsule.component,
    });

    if (app && typeof app.deploy === 'function') {
      await app.deploy(appDeployContext);
    }
  }

  private getBuildMetadata(buildTask: TaskResults, componentId: ComponentID, app: Application) {
    const componentResults = buildTask?.componentsResults.find((res) =>
      res.component.id.isEqual(componentId, { ignoreVersion: true })
    );

    // @ts-ignore
    const metadata = componentResults?.metadata?.buildDeployContexts.find(
      (ctx) => ctx.name === app.name && ctx.appType === app.applicationType
    );

    return metadata;
  }

  private getBuildMetadataFromCompObject(component: Component, app: Application) {
    const builderData = component.state.aspects.get('teambit.pipelines/builder')?.data;
    if (!builderData) return undefined;
    const appData = builderData.aspectsData.find((aspectData) => aspectData.aspectId === ApplicationAspect.id);
    if (!appData) return undefined;

    const metadata = appData.data.buildDeployContexts.find(
      (ctx) => ctx.name === app.name && ctx.appType === app.applicationType
    );

    return metadata;
  }

  private getBuildTask(taskResults: TaskResults[], runtime: string) {
    return taskResults.find(
      ({ task, env }) => task.aspectId === ApplicationAspect.id && task.name === BUILD_TASK && env.id === runtime
    );
  }
}
