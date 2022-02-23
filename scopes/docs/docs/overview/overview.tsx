import React, { useContext } from 'react';
import flatten from 'lodash.flatten';
import { ComponentContext, ComponentDescriptorContext } from '@teambit/component';
import type { SlotRegistry } from '@teambit/harmony';
import { ComponentPreview } from '@teambit/preview.ui.component-preview';
import { StatusMessageCard } from '@teambit/design.ui.surfaces.status-message-card';
import { ComponentOverview, TitleBadge } from '@teambit/component.ui.component-meta';
import { useFetchDocs } from '@teambit/component.ui.hooks.use-fetch-docs';
import { useLanesContext } from '@teambit/lanes.ui.lanes';
import { Separator } from '@teambit/design.ui.separator';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import styles from './overview.module.scss';

export type TitleBadgeSlot = SlotRegistry<TitleBadge[]>;

export type OverviewProps = {
  titleBadges: TitleBadgeSlot;
};

export function Overview({ titleBadges }: OverviewProps) {
  const component = useContext(ComponentContext);
  const componentDescriptor = useContext(ComponentDescriptorContext);
  const lanesModel = useLanesContext();
  const laneId = lanesModel?.currentLane?.id;
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
    const badges = flatten(titleBadges.values());

    return (
      <div className={styles.overviewWrapper}>
        {laneId && <LaneOverview laneId={laneId} />}
        <ComponentOverview
          className={styles.componentOverviewBlock}
          displayName={component.displayName}
          version={component.version}
          abstract={component.description || fetchComponent?.description}
          labels={labels || []}
          packageName={component.packageName}
          titleBadges={badges}
          componentDescriptor={componentDescriptor}
        />
        <ComponentPreview
          component={component}
          style={{ width: '100%', height: '100%' }}
          previewName="overview"
          fullContentHeight
          scrolling="no"
        />
      </div>
    );
  }

  return laneId ? (
    <div className={styles.overviewWrapper}>
      <LaneOverview laneId={laneId} />
      <ComponentPreview
        component={component}
        style={{ width: '100%', height: '100%' }}
        previewName="overview"
        fullContentHeight
        scrolling="no"
      />
    </div>
  ) : (
    <ComponentPreview
      component={component}
      style={{ width: '100%', height: '100%' }}
      previewName="overview"
      fullContentHeight
    />
  );
}

function LaneOverview({ laneId }: { laneId: string }): JSX.Element {
  return (
    <>
      <div className={styles.lane}>
        <Icon of="lane"></Icon>
        <Ellipsis className={styles.laneName}>{laneId}</Ellipsis>
      </div>
      <Separator isPresentational />
    </>
  );
}
