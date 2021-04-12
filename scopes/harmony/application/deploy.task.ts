import { BuildTask, BuiltTaskResult, BuildContext } from '@teambit/builder';
import { ApplicationAspect } from './application.aspect';
import { ApplicationMain } from './application.main.runtime';

export class DeployTask implements BuildTask {
  name = 'Application_Deployment';
  aspectId = ApplicationAspect.id;

  constructor(private application: ApplicationMain) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    await Promise.all(
      this.application.listApps().map(async (app) => {
        const aspectId = this.application.getAppAspect(app.name);
        if (!aspectId) return;
        const deployContext = await app.build(context, aspectId);
        if (app.deploy) await app.deploy(deployContext);
      })
    );
    return {
      componentsResults: [],
    };
  }
}
