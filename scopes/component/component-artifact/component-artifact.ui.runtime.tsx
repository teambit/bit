import React from 'react';
import {ComponentAspect, ComponentUI} from '@teambit/component';
import {UIRuntime} from '@teambit/ui';
import {ComponentArtifactPage} from './ui/component-artifact-page';
import {ComponentArtifactSection} from './component-artifact.section';
import ComponentArtifactAspect from './component-artifact.aspect';
import WorkspaceAspect, {WorkspaceUI} from '@teambit/workspace';
import ScopeAspect from '@teambit/scope';

export class ComponentArtifactUI {
    // ComponentArtifact = () => {
    //     return <ComponentArtifactPage />;
    // };

    static dependencies = [ComponentAspect, WorkspaceAspect, ScopeAspect];

    static runtime = UIRuntime;

    static async provider([component, workspace]: [ComponentUI, WorkspaceUI]) {
        const ui = new ComponentArtifactUI();
        const section = new ComponentArtifactSection();
        const host = workspace ? WorkspaceAspect.id : ScopeAspect.id;
        const componentId = ComponentAspect.id;

        component.registerRoute(
            {
                path: section.route.path,
                children: <ComponentArtifactPage host={host} componentId={componentId} />
            }
        );
        component.registerWidget(section.navigationLink, section.order);

        return ui;
    }
}

ComponentArtifactAspect.addRuntime(ComponentArtifactUI);
