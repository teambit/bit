import React from 'react';
import { ReactRouter } from '@teambit/react-router';
import {
  LanesProvider,
  useLanesContext,
  LaneModel,
  LaneDetails,
  LanesModel,
  useLaneReadme,
} from '@teambit/lanes.ui.lanes';
import { ComponentCard } from '@teambit/explorer.ui.gallery.component-card';
import { ComponentPreview } from '@teambit/preview.ui.component-preview';

import styles from './lane-readme.module.scss';

export type LaneReadmeProps = {
  host: string;
  currentLane: LaneModel;
};

export type LaneReadmeWrapperProps = {
  host: string;
};

export function LaneReadmeWrapper({ host }: LaneReadmeWrapperProps) {
  const lanesContext = useLanesContext();
  const currentLane = lanesContext?.currentLane;
  const readmeComponent = currentLane?.readmeComponent;

  if (readmeComponent) {
    return <LaneReadme host={host} currentLane={currentLane} />;
  }

  if (currentLane) {
    return <ReactRouter.Redirect to={`${LanesModel.getLaneUrl(currentLane.id)}/~gallery`} />;
  }

  return null;
}

function LaneReadme({ currentLane }: LaneReadmeProps) {
  const { model, loading } = useLaneReadme(currentLane);
  const laneComponents = currentLane.components;

  if (loading) return null;

  return (
    <LanesProvider viewedLaneId={undefined}>
      <div className={styles.readmeContainer}>
        <LaneDetails
          className={styles.laneId}
          laneName={currentLane.id}
          componentCount={laneComponents.length || undefined}
        ></LaneDetails>
        <div className={styles.laneReadmeOverview}>
          <ComponentPreview
            component={model}
            style={{ width: '100%', height: '100%' }}
            previewName="overview"
            fullContentHeight
          />
        </div>
        <div className={styles.readmeComponentCardContainer}>
          <ComponentCard
            className={styles.readmeComponentCard}
            hidePreview={true}
            key={model.id.toString()}
            id={model.id.fullName}
            href={LanesModel.getLaneComponentUrl(model.id, currentLane.id)}
            envIcon={model.environment?.icon}
            description={model.description}
            version={model.version === 'new' ? undefined : model.version}
          />
        </div>
      </div>
    </LanesProvider>
  );
}
