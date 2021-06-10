import React, { useContext } from 'react';
import { ComponentContext, ComponentModel } from '@teambit/component';
import { ComponentPreview } from '@teambit/preview.ui.component-preview';
import { StatusMessageCard } from '@teambit/design.ui.surfaces.status-message-card';

export function Overview() {
  const component = useContext(ComponentContext);
  if (getBuildStatus(component) === 'pending')
    return (
      <StatusMessageCard style={{ margin: 'auto' }} status="PROCESSING" title="component preview pending">
        this might take some time
      </StatusMessageCard>
    );
  if (getBuildStatus(component) === 'failed')
    return (
      <StatusMessageCard
        style={{ margin: 'auto' }}
        status="FAILURE"
        title="failed to get component preview "
      ></StatusMessageCard>
    );
  return <ComponentPreview component={component} style={{ width: '100%', height: '100%' }} previewName="overview" />;
}

function getBuildStatus(component: ComponentModel) {
  if (component?.host === 'teambit.workspace/workspace') return;
  return component.buildStatus;
}
