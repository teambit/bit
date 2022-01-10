import mapSeries from 'p-map-series';
import { Capsule } from '@teambit/isolator';
import { BuildTask, BuiltTaskResult, BuildContext, ComponentResult, ArtifactDefinition } from '@teambit/builder';
import { ComponentID } from '@teambit/component';
import { ApplicationAspect } from './application.aspect';
import { ApplicationMain } from './application.main.runtime';

export const BUILD_TASK = 'build_application';

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
    const componentsResults = await mapSeries(apps, async (app): Promise<AppsResults | undefined> => {
      const aspectId = this.application.getAppAspect(app.name);
      if (!aspectId) return undefined;
      const capsules = context.capsuleNetwork.seedersCapsules;
      const capsule = this.getCapsule(capsules, aspectId);
      if (!capsule || !app.build) return undefined;
      const deployContext = await app.build(context, capsule);
      return {
        artifacts: deployContext.artifacts,
        componentResult: { component: capsule.component },
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

  private getCapsule(capsules: Capsule[], aspectId: string) {
    const aspectCapsuleId = ComponentID.fromString(aspectId).toStringWithoutVersion();
    return capsules.find((capsule) => capsule.component.id.toStringWithoutVersion() === aspectCapsuleId);
  }
}
