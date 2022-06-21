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
import { ComponentID } from '@teambit/component';
import { ApplicationAspect } from './application.aspect';
import { ApplicationMain } from './application.main.runtime';
import { AppBuildContext } from './app-build-context';

export const BUILD_TASK = 'build_application';
export const ARTIFACTS_DIR_NAME = 'apps';

export type AppsResults = {
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
    const apps = this.application.listApps();
    const { capsuleNetwork } = context;
    const componentsResults = await mapSeries(apps, async (app): Promise<AppsResults | undefined> => {
      const aspectId = this.application.getAppAspect(app.name);
      if (!aspectId) return undefined;
      const capsule = capsuleNetwork.seedersCapsules.getCapsuleIgnoreVersion(ComponentID.fromString(aspectId));
      if (!capsule || !app.build) return undefined;
      const { component } = capsule;
      const appDeployContext: AppBuildContext = Object.assign(context, {
        capsule,
        appComponent: component,
        name: app.name,
        artifactsDir: this.getArtifactDirectory(),
      });
      const deployContext = await app.build(appDeployContext);
      const defaultArtifacts: ArtifactDefinition[] = this.getDefaultArtifactDef();
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
          _metadata: { deployContext },
        },
      };
    });

    const artifacts = componentsResults
      .flatMap((res) => {
        return res?.artifacts;
      })
      .filter((a) => !!a) as ArtifactDefinition[];
    const _componentsResults = componentsResults
      .map((res) => {
        return res?.componentResult;
      })
      .filter((a) => !!a) as ComponentResult[];
    return {
      artifacts,
      componentsResults: _componentsResults,
    };
  }

  private getArtifactDirectory() {
    return join(CAPSULE_ARTIFACTS_DIR, ARTIFACTS_DIR_NAME);
  }

  private getDefaultArtifactDef(): ArtifactDefinition[] {
    return [
      {
        name: 'apps',
        globPatterns: ['**'],
        rootDir: this.getArtifactDirectory(),
      },
    ];
  }
}
