import React, { useContext } from 'react';
import { ComponentContext } from '@teambit/component';
import { ComponentPreview } from '@teambit/preview.ui.component-preview';
import { StatusMessageCard } from '@teambit/design.ui.surfaces.status-message-card';
import { ComponentOverview, TitleBadge } from '@teambit/component.ui.component-meta';
import { useFetchDocs } from '@teambit/component.ui.hooks.use-fetch-docs';
import styles from './overview.module.scss';

export type OverviewProps = {
  titleBadges: TitleBadge[];
};

export function Overview({ titleBadges }: OverviewProps) {
  const component = useContext(ComponentContext);
  const { data } = useFetchDocs(component.id.toString());
  const fetchComponent = data?.component;
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
    const labels = component.labels.length > 0 ? component.labels : fetchComponent?.labels;
    return (
      <div className={styles.overviewWrapper}>
        <ComponentOverview
          className={styles.overview}
          displayName={component.displayName}
          version={component.version}
          abstract={component.description || fetchComponent?.description}
          labels={labels || []}
          packageName={component.packageName}
          titleBadges={titleBadges.values()}
        />
        <ComponentPreview component={component} style={{ width: '100%', height: '100%' }} previewName="overview" />
      </div>
    );
  }

  return <ComponentPreview component={component} style={{ width: '100%', height: '100%' }} previewName="overview" />;
}
