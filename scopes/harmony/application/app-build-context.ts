import { Component } from '@teambit/component';
import { Capsule, Network } from '@teambit/isolator';
import { BuildContext, PipeName, TaskResults } from '@teambit/builder';
import { LaneId } from '@teambit/lane-id';
import { AppContext } from './app-context';

export type AppBuildContextCreate = {
  appContext: AppContext;
  buildContext: BuildContext;
  name: string;
  appComponent: Component;
  artifactsDir: string;
  capsule: Capsule;
};

export class AppBuildContext extends AppContext implements BuildContext {
  constructor(
    readonly appContext: AppContext,
    readonly capsuleNetwork: Network,
    readonly previousTasksResults: TaskResults[],
    readonly pipeName: PipeName,
    readonly capsule: Capsule,
    readonly name: string,
    readonly appComponent: Component,
    readonly artifactsDir: string,
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
      appContext.args,
      appContext.workspaceComponentPath,
      appContext.envVariables
    );
  }

  static create({ name, capsule, appComponent, artifactsDir, appContext, buildContext }: AppBuildContextCreate) {
    return new AppBuildContext(
      appContext,
      buildContext.capsuleNetwork,
      buildContext.previousTasksResults,
      buildContext.pipeName,
      capsule,
      name,
      appComponent,
      artifactsDir,
      buildContext.laneId
    );
  }
}
