import React from 'react';
import { ReactRouter } from '@teambit/react-router';
import {
  LanesProvider,
  useLanesContext,
  LaneModel,
  LaneDetails,
  LanesModel,
  useLaneReadmeQuery,
} from '@teambit/lanes.ui.lanes';
import { ComponentProvider, ComponentDescriptorProvider } from '@teambit/component';
import { Overview } from '@teambit/docs';
// import { ComponentCard } from '@teambit/explorer.ui.gallery.component-card';
// import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
// import { H5 } from '@teambit/documenter.ui.heading';
// import { Carousel } from '@teambit/design.content.carousel';
import { ComponentCard } from '@teambit/explorer.ui.gallery.component-card';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';

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
  const { model, descriptor, loading } = useLaneReadmeQuery(currentLane);
  const laneComponents = currentLane.components;

  if (loading) return null;

  return (
    <LanesProvider viewedLaneId={undefined}>
      <ComponentProvider component={model}>
        <ComponentDescriptorProvider componentDescriptor={descriptor}>
          <div className={styles.readmeContainer}>
            <LaneDetails
              className={styles.laneId}
              laneName={currentLane.id}
              componentCount={laneComponents.length || undefined}
            ></LaneDetails>
            <Overview hideOverviewHeader={true} className={styles.laneReadmeOverview} />
            {/* {hasComponents && <H5 className={styles.carouselTitle}>Components</H5>} */}
            {/* {hasComponents && (
              <Carousel animation={true} className={styles.laneCarousel}>
                {laneComponents.map((laneComponent) => (
                  <ComponentCard
                    className={styles.laneCarouselComponent}
                    hidePreview={true}
                    key={laneComponent.model.id.fullName}
                    id={laneComponent.model.id.fullName}
                    href={LanesModel.getLaneComponentUrl(laneComponent.model.id, currentLane.id)}
                    envIcon={laneComponent.model.environment?.icon}
                    description={laneComponent.model.description}
                    version={laneComponent.model.version === 'new' ? undefined : laneComponent.model.version}
                    preview={<PreviewPlaceholder component={laneComponent.model} shouldShowPreview={true} />}
                  />
                ))}
              </Carousel>
            )} */}
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
                preview={<PreviewPlaceholder component={model} shouldShowPreview={true} />}
              />
            </div>
          </div>
        </ComponentDescriptorProvider>
      </ComponentProvider>
    </LanesProvider>
  );
}
