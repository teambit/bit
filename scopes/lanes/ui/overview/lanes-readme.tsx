import React from 'react';
import { ReactRouter } from '@teambit/react-router';
import { LanesProvider, LaneComponentModel, useLanesContext, LaneModel, LaneDetails } from '@teambit/lanes.ui.lanes';
import { ComponentProvider, useComponent } from '@teambit/component';
import { Overview } from '@teambit/docs';
import { Carousel } from '@teambit/design.content.carousel';
import { ComponentCard } from '@teambit/explorer.ui.gallery.component-card';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import { H5 } from '@teambit/documenter.ui.heading';

import styles from './lanes-readme.module.scss';

export type LaneReadmeProps = {
  host: string;
  readmeComponent: LaneComponentModel;
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
    return <LaneReadme host={host} readmeComponent={readmeComponent} currentLane={currentLane} />;
  }

  if (currentLane) {
    return <ReactRouter.Redirect to={`${currentLane.url}/~gallery`} />;
  }

  return null;
}

function LaneReadme({ host, readmeComponent, currentLane }: LaneReadmeProps) {
  const { component } = useComponent(host, readmeComponent.model.id);

  if (!component) {
    return null;
  }

  const laneComponents = currentLane.components;

  return (
    <LanesProvider currentLaneId={undefined}>
      <ComponentProvider component={component}>
        <div className={styles.readmeContainer}>
          <LaneDetails className={styles.laneId} laneName={currentLane.id}></LaneDetails>
          <Overview cannotBeConsumed={true} />
          <H5 className={styles.carouselTitle}>Components</H5>
          <Carousel animation={true} className={styles.laneCarousel}>
            {laneComponents.map((laneComponent) => (
              <ComponentCard
                key={laneComponent.model.id.fullName}
                id={laneComponent.model.id.fullName}
                href={laneComponent.url}
                envIcon={laneComponent.model.environment?.icon}
                description={laneComponent.model.description}
                version={laneComponent.model.version === 'new' ? undefined : laneComponent.model.version}
                preview={<PreviewPlaceholder component={component} shouldShowPreview={true} />}
              />
            ))}
          </Carousel>
        </div>
      </ComponentProvider>
    </LanesProvider>
  );
}
