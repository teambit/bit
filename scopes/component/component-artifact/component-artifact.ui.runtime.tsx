import React, { ComponentType } from 'react';
import { ComponentAspect, ComponentModel, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { ComponentArtifactPage } from './ui/component-artifact-page';
import { ComponentArtifactSection } from './component-artifact.section';
import ComponentArtifactAspect from './component-artifact.aspect';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import ScopeAspect from '@teambit/scope';
import { Slot, SlotRegistry } from '@teambit/harmony';
import GraphAspect from '@teambit/graph';

export class ComponentArtifactUI {
    static dependencies = [ComponentAspect, WorkspaceAspect, ScopeAspect, GraphAspect];

    static runtime = UIRuntime;

    static async provider([component, workspace]: [ComponentUI, WorkspaceUI]) {
        const ui = new ComponentArtifactUI();

        const section = new ComponentArtifactSection();
        const host = workspace ? WorkspaceAspect.id : ScopeAspect.id;

        // todo: move this to ComponentArtifactSection
        component.registerRoute(
            {
                path: section.route.path,
                children: <ComponentArtifactPage host={host} />
            }
        );
        component.registerWidget(section.navigationLink, section.order);

        return ui;
    }
}

ComponentArtifactAspect.addRuntime(ComponentArtifactUI);
