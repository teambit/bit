import { join } from 'path';
import mapSeries from 'p-map-series';
import {
  BuildTask,
  BuiltTaskResult,
  BuildContext,
  ComponentResult,
  ArtifactDefinition,
  CAPSULE_ARTIFACTS_DIR,
} from '@teambit/builder';
import { compact } from 'lodash';
import { Capsule } from '@teambit/isolator';
import { Component } from '@teambit/component';

import { ApplicationAspect } from './application.aspect';
import { ApplicationMain } from './application.main.runtime';
import { AppBuildContext } from './app-build-context';
import { Application } from './application';

export const BUILD_TASK = 'build_application';
export const ARTIFACTS_DIR_NAME = 'apps';

export type OneAppResult = {
  componentResult: ComponentResult;
  artifacts?: ArtifactDefinition[];
};

export type OneComponentResult = {
  componentResult: ComponentResult;
  artifacts?: ArtifactDefinition[];
};

export type BuildAppResult = {
  componentResult: ComponentResult;
  artifacts?: ArtifactDefinition[];
};

export type Options = {
  deploy: boolean;
};
export class AppsBuildTask implements BuildTask {
  name = BUILD_TASK;
  aspectId = ApplicationAspect.id;
  readonly location = 'end';
  constructor(private application: ApplicationMain, private opt: Options = { deploy: true }) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const originalSeedersIds = context.capsuleNetwork.originalSeedersCapsules.map((c) => c.component.id.toString());
    const { capsuleNetwork } = context;
    const result: BuiltTaskResult = {
      componentsResults: [],
    };

    // const componentsResults = await mapSeries(apps, async (app): Promise<AppsResults | undefined> => {
    await mapSeries(capsuleNetwork.originalSeedersCapsules, async (capsule) => {
      const component = capsule.component;
      if (originalSeedersIds && originalSeedersIds.length && !originalSeedersIds.includes(component.id.toString())) {
        return undefined;
      }

      const apps = await this.application.loadAppsFromComponent(component, capsule.path);
      if (!apps || !apps.length) return undefined;
      const componentsResults = await mapSeries(compact(apps), async (app) =>
        this.runForOneApp(app, component, capsule, context)
      );
      const merged = this.mergeAppsResults(compact(componentsResults));
      if (merged) {
        result.componentsResults.push(merged.componentResult);
        if (!result.artifacts) result.artifacts = [];
        result.artifacts.push(...(merged.artifacts || []));
      }
      return undefined;
    });

    return result;
  }

  private async runForOneApp(
    app: Application,
    component: Component,
    capsule: Capsule,
    context: BuildContext
  ): Promise<OneAppResult | undefined> {
    if (!app.build) return undefined;
    // const { component } = capsule;
    const appDeployContext: AppBuildContext = Object.assign(context, {
      capsule,
      appComponent: component,
      name: app.name,
      artifactsDir: this.getArtifactDirectory(),
    });
    const deployContext = await app.build(appDeployContext);
    const defaultArtifacts: ArtifactDefinition[] = this.getDefaultArtifactDef(app.applicationType || app.name);
    const artifacts = defaultArtifacts.concat(deployContext.artifacts || []);

    return {
      artifacts,
      componentResult: {
        component: capsule.component,
        errors: deployContext.errors,
        warnings: deployContext.warnings,
        /**
         * @guysaar223
         * @ram8
         * TODO: we need to think how to pass private metadata between build pipes, maybe create shared context
         * or create new deploy context on builder
         */
        // @ts-ignore
        _metadata: { deployContext, name: app.name, appType: app.applicationType },
      },
    };
  }

  private mergeAppsResults(appsResults: OneAppResult[]): OneComponentResult | undefined {
    if (!appsResults || !appsResults.length) return undefined;
    const merged: OneComponentResult = {
      artifacts: [],
      componentResult: {
        component: appsResults[0].componentResult.component,
        errors: [],
        warnings: [],
        // @ts-ignore
        _metadata: {
          buildDeployContexts: [],
        },
      },
    };
    appsResults.forEach((appResult) => {
      merged.artifacts = (merged.artifacts || []).concat(appResult.artifacts || []);
      merged.componentResult.errors = (merged.componentResult.errors || []).concat(
        appResult.componentResult.errors || []
      );
      merged.componentResult.warnings = (merged.componentResult.warnings || []).concat(
        appResult.componentResult.warnings || []
      );
      // @ts-ignore
      merged.componentResult._metadata.buildDeployContexts = ( // @ts-ignore
        merged.componentResult._metadata.buildDeployContexts || []
      )
        // @ts-ignore
        .concat(appResult.componentResult._metadata || []);
    });
    return merged;
  }

  private getArtifactDirectory() {
    return join(CAPSULE_ARTIFACTS_DIR, ARTIFACTS_DIR_NAME);
  }

  private getDefaultArtifactDef(nameSuffix: string): ArtifactDefinition[] {
    return [
      {
        name: `app-build-${nameSuffix}`,
        globPatterns: ['**'],
        rootDir: this.getArtifactDirectory(),
      },
    ];
  }
}
