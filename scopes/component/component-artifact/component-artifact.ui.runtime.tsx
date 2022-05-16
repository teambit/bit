import { ComponentAspect, ComponentUI } from '@teambit/component';
import ScopeAspect from '@teambit/scope';
import { UIRuntime } from '@teambit/ui';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import ComponentArtifactAspect from './component-artifact.aspect';
import { ComponentArtifactSection } from './component-artifact.section';

export class ComponentArtifactUI {
    static dependencies = [ComponentAspect, WorkspaceAspect, ScopeAspect];

    static runtime = UIRuntime;

    static async provider([component, workspace]: [ComponentUI, WorkspaceUI]) {
        const ui = new ComponentArtifactUI();

        const host = workspace ? WorkspaceAspect.id : ScopeAspect.id;
        const section = new ComponentArtifactSection(host);

        component.registerRoute(section.route);
        component.registerNavigation(section.navigationLink, section.order);

        return ui;
    }
}

ComponentArtifactAspect.addRuntime(ComponentArtifactUI);
