import { Component } from '@teambit/component';
import { Capsule, Network } from '@teambit/isolator';
import { BuildContext, PipeName, TaskResults } from '@teambit/builder';
import { LaneId } from '@teambit/lane-id';
import { AppContext } from './app-context';

export class AppBuildContext extends AppContext implements BuildContext {
  constructor(
    readonly appContext: AppContext,
    readonly capsuleNetwork: Network,
    readonly previousTasksResults: TaskResults[],
    readonly pipeName: PipeName,
    readonly laneId?: LaneId | undefined
  ) {
    super(
      appContext.appName,
      appContext.harmony,
      appContext.dev,
      appContext.appComponent,
      appContext.workdir,
      appContext.execContext,
      appContext.hostRootDir,
      appContext.port,
      appContext.workspaceComponentPath,
      appContext.envVariables
    );
  }
  /**
   * name of the type of the app. e.g. `react-app`
   */
  name: string;
  /**
   * Application capsule
   */
  capsule: Capsule;

  /**
   * app Component object
   */
  appComponent: Component;

  /**
   * A path (relative to the capsule root) that contain artifacts that will be picked and store by default
   */
  artifactsDir: string;

  static create(appContext: AppContext, buildContext: BuildContext) {
    return new AppBuildContext(
      appContext,
      buildContext.capsuleNetwork,
      buildContext.previousTasksResults,
      buildContext.pipeName,
      buildContext.laneId
    );
  }
}
