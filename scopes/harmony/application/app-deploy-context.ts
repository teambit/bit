import { ArtifactDefinition } from '@teambit/builder';
import { AppBuildContext } from './app-build-context';

export class AppDeployContext extends AppBuildContext {
  constructor(
    appBuildContext: AppBuildContext,
    readonly artifacts: ArtifactDefinition[],
  ) {
    super(
      appBuildContext.appContext,
      appBuildContext.capsuleNetwork,
      appBuildContext.previousTasksResults,
      appBuildContext.pipeName,
      appBuildContext.laneId
    );
  }
}
