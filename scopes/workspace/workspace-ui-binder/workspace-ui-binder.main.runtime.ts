import { MainRuntime } from '@teambit/cli';
import type { BundlerMain } from '@teambit/bundler';
import { BundlerAspect } from '@teambit/bundler/dist/bundler.aspect.js';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql/dist/graphql.aspect.js';
import type { UiMain } from '@teambit/ui';
import { UIAspect } from '@teambit/ui/dist/ui.aspect.js';
import type { WorkspaceMain } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace/dist/workspace.aspect.js';
import { WorkspaceUIRoot } from '@teambit/workspace/dist/workspace.ui-root';
import getWorkspaceSchema from '@teambit/workspace/dist/workspace.graphql';
import { WorkspaceUiBinderAspect } from './workspace-ui-binder.aspect';

export class WorkspaceUiBinderMain {
  static runtime = MainRuntime;
  static dependencies = [WorkspaceAspect, UIAspect, BundlerAspect, GraphqlAspect];
  static slots = [];
  static async provider([workspaceMain, ui, bundler, graphql]: [WorkspaceMain, UiMain, BundlerMain, GraphqlMain]) {
    // workspace.main.runtime returns `undefined` outside a workspace; in
    // that case there's nothing for the UI / GraphQL server to bind to.
    const workspace = workspaceMain as any;
    if (!workspace || !workspace.path) return undefined;
    ui.registerUiRoot(new WorkspaceUIRoot(workspace, bundler));
    ui.registerPreStart(async () => {
      return workspace.setComponentPathsRegExps();
    });
    graphql.register(() => getWorkspaceSchema(workspace, graphql));
    return undefined;
  }
}

WorkspaceUiBinderAspect.addRuntime(WorkspaceUiBinderMain);

export default WorkspaceUiBinderMain;
