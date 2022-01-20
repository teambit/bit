import React, { useContext } from 'react';
import { ComponentContext } from '@teambit/component';
import { ComponentPreview } from '@teambit/preview.ui.component-preview';
import { StatusMessageCard } from '@teambit/design.ui.surfaces.status-message-card';
import { ComponentOverview, TitleBadge } from '@teambit/component.ui.component-meta';

export type OverviewProps = {
  titleBadges: TitleBadge[];
};

export function Overview({ titleBadges }: OverviewProps) {
  const component = useContext(ComponentContext);
  if (component?.buildStatus === 'pending' && component?.host === 'teambit.scope/scope')
    return (
      <StatusMessageCard style={{ margin: 'auto' }} status="PROCESSING" title="component preview pending">
        this might take some time
      </StatusMessageCard>
    );
  if (component?.buildStatus === 'failed' && component?.host === 'teambit.scope/scope')
    return (
      <StatusMessageCard
        style={{ margin: 'auto' }}
        status="FAILURE"
        title="failed to get component preview "
      ></StatusMessageCard>
    );

  if (component.preview?.includesEnvTemplate === false) {
    return (
      <>
        <ComponentOverview
          displayName={component.displayName}
          version={component.version}
          abstract={component.description}
          labels={component.labels}
          packageName={component.packageName}
          titleBadges={titleBadges}
        />
        <ComponentPreview component={component} style={{ width: '100%', height: '100%' }} previewName="overview" />;
      </>
    );
  }

  return <ComponentPreview component={component} style={{ width: '100%', height: '100%' }} previewName="overview" />;
}
