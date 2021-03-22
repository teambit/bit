import { BuildTask, BuiltTaskResult, BuildContext } from '@teambit/builder';
import { ApplicationAspect } from './application.aspect';
import { ApplicationMain } from './application.main.runtime';

export class DeployTask implements BuildTask {
  name = 'deploy';
  aspectId = ApplicationAspect.id;

  constructor(private application: ApplicationMain) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    return {
      componentsResults: [],
    };
  }
}
