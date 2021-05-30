import mapSeries from 'p-map-series';
import { Capsule } from '@teambit/isolator';
import { BuildTask, BuiltTaskResult, BuildContext, ComponentResult } from '@teambit/builder';
import { ComponentID } from '@teambit/component';
import { ApplicationAspect } from './application.aspect';
import { ApplicationMain } from './application.main.runtime';
import { DeployContext } from './deploy-context';

export const BUILD_UI_TASK = 'build_ui_application';

export class DeployTask implements BuildTask {
  name = BUILD_UI_TASK;
  aspectId = ApplicationAspect.id;

  constructor(private application: ApplicationMain) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const apps = this.application.listApps();
    const componentsResultsUi = await mapSeries(
      apps,
      async (app): Promise<ComponentResult | undefined> => {
        const aspectId = this.application.getAppAspect(app.name);
        if (!aspectId) return undefined;
        const capsules = context.capsuleNetwork.seedersCapsules;
        const capsule = this.getCapsule(capsules, aspectId);
        if (!capsule) return undefined;
        const deployContext = await app.build(context, aspectId, capsule);
        if (!deployContext.publicDir) return undefined;
        if (app.deploy) await app.deploy(deployContext);
        await this.deployToProviders(deployContext);
        return { component: capsule.component, metadata: { publicDir: deployContext.publicDir } };
      }
    );

    return {
      componentsResults: componentsResultsUi.flatMap((f) => (f ? [f] : [])),
    };
  }

  private getCapsule(capsules: Capsule[], aspectId: string) {
    const aspectCapsuleId = ComponentID.fromString(aspectId).toStringWithoutVersion();
    return capsules.find((capsule) => capsule.component.id.toStringWithoutVersion() === aspectCapsuleId);
  }

  private async deployToProviders(deployContext: DeployContext) {
    const providers = this.application.listProviders();
    await mapSeries(providers, async (provider) => provider.deploy(deployContext));
  }
}
