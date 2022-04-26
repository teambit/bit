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
import { ComponentProvider, ComponentDescriptorProvider, ComponentModel } from '@teambit/component';
import { Overview } from '@teambit/docs';
// import { Carousel } from '@teambit/design.content.carousel';
// import { ComponentCard } from '@teambit/explorer.ui.gallery.component-card';
// import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import { H5 } from '@teambit/documenter.ui.heading';
import { Separator } from '@teambit/design.ui.separator';
import { ComponentDescriptor } from '@teambit/component-descriptor';

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
  const hasComponents = laneComponents.length > 0;
  //   const emptyLane = (
  //     <EmptyLane
  //       className={styles.emptyLane}
  //       message={'Start by snapping components to this Lane.'}
  //       name={currentLane.name}
  //       title={'Snap components to'}
  //     />
  //   );

  if (loading) return null;
  return (
    <LanesProvider viewedLaneId={undefined}>
      <ComponentProvider component={model}>
        <ComponentDescriptorProvider componentDescriptor={descriptor}>
          <div className={styles.readmeContainer}>
            <LaneDetails
              className={styles.laneId}
              laneName={currentLane.id}
              componentCount={laneComponents.length + 100}
            ></LaneDetails>
            <Overview />
            {hasComponents && <H5 className={styles.carouselTitle}>Components</H5>}
            {/* {hasComponents && (
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
            )} */}
          </div>
        </ComponentDescriptorProvider>
      </ComponentProvider>
    </LanesProvider>
  );
}
