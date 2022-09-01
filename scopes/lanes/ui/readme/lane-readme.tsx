import React, { useMemo } from 'react';
import { LaneModel, LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { LanesProvider } from '@teambit/lanes.hooks.use-lanes';
import { useLaneReadme } from '@teambit/lanes.hooks.use-lane-readme';
import { LaneDetails, LaneOverviewLineSlot } from '@teambit/lanes.ui.gallery';
import { ComponentCard } from '@teambit/explorer.ui.gallery.component-card';
import { ComponentPreview } from '@teambit/preview.ui.component-preview';
import { RouteSlot, SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import flatten from 'lodash.flatten';
import styles from './lane-readme.module.scss';

export type LaneReadmeProps = {
  host: string;
  viewedLane: LaneModel;
  overviewSlot?: LaneOverviewLineSlot;
  routeSlot: RouteSlot;
};

export function LaneReadme({ viewedLane, overviewSlot, routeSlot }: LaneReadmeProps) {
  const { component, loading } = useLaneReadme(viewedLane.id, !viewedLane.readmeComponent);
  const laneComponents = viewedLane.components;
  const overviewItems = useMemo(() => flatten(overviewSlot?.values()), [overviewSlot]);

  if (loading) return null;

  return (
    <LanesProvider viewedLaneId={undefined}>
      <div className={styles.readmeContainer}>
        <LaneDetails
          className={styles.laneId}
          laneId={viewedLane.id}
          componentCount={laneComponents.length || undefined}
        ></LaneDetails>
        <div className={styles.laneReadmePreviewContainer}>
          <ComponentPreview
            component={component}
            style={{ width: '100%', height: '100%' }}
            previewName="overview"
            fullContentHeight
            scrolling="no"
          />
          <div className={styles.readmeComponentCardContainer}>
            <ComponentCard
              className={styles.readmeComponentCard}
              key={component.id.toString()}
              id={component.id.fullName}
              href={LanesModel.getLaneComponentUrl(component.id, viewedLane.id)}
              envIcon={component.environment?.icon}
              description={component.description}
              version={component.version === 'new' ? undefined : component.version}
              preview={<PreviewPlaceholder component={component} shouldShowPreview={true} />}
            />
          </div>
        </div>
        {routeSlot && <SlotRouter slot={routeSlot} />}
        {overviewItems.length > 0 && overviewItems.map((Item, index) => <Item key={index} />)}
      </div>
    </LanesProvider>
  );
}
