import React, { useContext } from 'react';
import { ComponentContext } from '@teambit/component';
import { ComponentPreview } from '@teambit/preview.ui.component-preview';
import { StatusMessageCard } from '@teambit/design.ui.surfaces.status-message-card';

export function Overview() {
  const component = useContext(ComponentContext);
  if (component.buildStatus === 'pending')
    return (
      <StatusMessageCard style={{ margin: '16px' }} status="PROCESSING" title="component preview pending">
        this might take some time
      </StatusMessageCard>
    );
  if (component.buildStatus === 'failed')
    return (
      <StatusMessageCard
        style={{ margin: '16px' }}
        status="FAILURE"
        title="failed to get component preview "
      ></StatusMessageCard>
    );
  return <ComponentPreview component={component} style={{ width: '100%', height: '100%' }} previewName="overview" />;
}
