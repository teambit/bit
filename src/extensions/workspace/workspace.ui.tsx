import React from 'react';
import { Slot } from '@teambit/harmony';
import { RouteProps } from 'react-router-dom';
import { Workspace } from './ui';
import { RouteSlot } from '../react-router/slot-router';
import { UIRoot } from '../ui/ui-root.ui';
import { UIRuntimeExtension } from '../ui/ui.ui';
import ComponentUI from '../component/component.ui';
import { Workspace as WorkspaceModel } from './ui/workspace/workspace-model';

export type MenuItem = {
  label: JSX.Element | string | null;
};

export class WorkspaceUI {
  constructor(
    /**
     * route slot.
     */
    private routeSlot: RouteSlot,

    /**
     * component ui extension.
     */
    private componentUi: ComponentUI
  ) {
    this.registerExplicitRoutes();
  }

  /**
   * register a route to the workspace.
   */
  registerRoute(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  listComponents = () => {
    return this.workspace?.components;
  };

  private workspace?: WorkspaceModel;

  private registerExplicitRoutes() {
    this.routeSlot.register({
      path: this.componentUi.routePath,
      children: this.componentUi.getComponentUI(WorkspaceUI.id),
    });
  }

  private setWorkspace = (workspace: WorkspaceModel) => {
    this.workspace = workspace;
  };

  get root(): UIRoot {
    return {
      routes: [
        {
          path: '/',
          children: <Workspace routeSlot={this.routeSlot} setWorkspace={this.setWorkspace} />,
        },
      ],
    };
  }

  static dependencies = [UIRuntimeExtension, ComponentUI];

  // TODO: @gilad we must automate this.
  static id = '@teambit/workspace';

  static slots = [Slot.withType<RouteProps>()];

  static async provider([ui, componentUi]: [UIRuntimeExtension, ComponentUI], config, [routeSlot]: [RouteSlot]) {
    const workspaceUI = new WorkspaceUI(routeSlot, componentUi);
    ui.registerRoot(workspaceUI.root);

    return workspaceUI;
  }
}

export default WorkspaceUI;
