import mapSeries from 'p-map-series';
import { BuilderMain, BuildTask, BuildContext, ComponentResult, TaskResults, BuiltTaskResult } from '@teambit/builder';
import { compact } from 'lodash';
import { Capsule } from '@teambit/isolator';
import { Component } from '@teambit/component';
import { ApplicationAspect } from './application.aspect';
import { ApplicationMain } from './application.main.runtime';
import { BUILD_TASK, BuildDeployContexts } from './build-application.task';
import { AppDeployContext } from './app-deploy-context';
import { Application } from './application';
import { ApplicationDeployment } from './app-instance';

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
      const appDeployments = await mapSeries(compact(apps), async (app) => this.runForOneApp(app, capsule, context));
      const deploys = compact(appDeployments);
      return { component, deploys };
    });

    const _componentsResults: ComponentResult[] = compact(components).map(({ component, deploys }) => {
      return { 
        component,
        metadata: {
          deployments: deploys.map((deploy) => {
            const deployObject = deploy || {};
            return {
              appName: deployObject?.appName,
              timestamp: deployObject?.timestamp,
              url: deployObject?.url
            }
          })
        }
      };
    });

    return {
      componentsResults: _componentsResults,
    };
  }

  private async runForOneApp(
    app: Application, 
    capsule: Capsule, 
    context: BuildContext
  ): Promise<ApplicationDeployment|void|undefined> {
    const aspectId = this.application.getAppAspect(app.name);
    if (!aspectId) return undefined;

    if (!capsule || !capsule?.component) return undefined;

    const buildTask = this.getBuildTask(context.previousTasksResults, context.envRuntime.id);

    const metadata = this.getBuildMetadata(buildTask, capsule.component);
    if (!metadata) return undefined;
    const buildDeployContexts = metadata.find((ctx) => ctx.name === app.name && ctx.appType === app.applicationType);
    if (!buildDeployContexts) return undefined;

    const artifacts = this.builder.getArtifacts(capsule.component);
    const appDeployContext: AppDeployContext = Object.assign(context, buildDeployContexts.deployContext, {
      capsule,
      artifacts,
      appComponent: capsule.component,
    });

    if (app && typeof app.deploy === 'function') {
      return app.deploy(appDeployContext);
    }

    return undefined;
  }

  private getBuildMetadata(
    buildTask: TaskResults | undefined,
    component: Component
  ): BuildDeployContexts[] | undefined {
    if (!buildTask) {
      const appData = this.builder.getDataByAspect(component, ApplicationAspect.id);
      if (!appData) return undefined;
      return appData.buildDeployContexts;
    }
    const componentResults = buildTask?.componentsResults.find((res) =>
      res.component.id.isEqual(component.id, { ignoreVersion: true })
    );
    return componentResults?.metadata?.buildDeployContexts;
  }

  private getBuildTask(taskResults: TaskResults[], runtime: string) {
    return taskResults.find(
      ({ task, env }) => task.aspectId === ApplicationAspect.id && task.name === BUILD_TASK && env.id === runtime
    );
  }
}
