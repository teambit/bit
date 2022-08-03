import { ComponentAspect, ComponentUI } from '@teambit/component';
import ScopeAspect from '@teambit/scope';
import { UIRuntime } from '@teambit/ui';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import { BuilderAspect } from './builder.aspect';
import { BuilderSection } from './builder.section';

export class BuilderUI {
  static dependencies = [ComponentAspect, WorkspaceAspect, ScopeAspect];

  static runtime = UIRuntime;

  static async provider([component, workspace]: [ComponentUI, WorkspaceUI]) {
    const ui = new BuilderUI();

    const host = workspace ? WorkspaceAspect.id : ScopeAspect.id;
    const section = new BuilderSection(host);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);

    return ui;
  }
}

BuilderAspect.addRuntime(BuilderUI);
