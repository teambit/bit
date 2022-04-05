import React from 'react';
import { ReactRouter } from '@teambit/react-router';
import { LanesProvider, useLanesContext, LaneModel, LaneDetails, LanesModel } from '@teambit/lanes.ui.lanes';
import { ComponentProvider, useComponent, ComponentDescriptorProvider, ComponentModel } from '@teambit/component';
import { Overview } from '@teambit/docs';
import { Carousel } from '@teambit/design.content.carousel';
import { ComponentCard } from '@teambit/explorer.ui.gallery.component-card';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import { H5 } from '@teambit/documenter.ui.heading';
import { Separator } from '@teambit/design.ui.separator';
import { EmptyLane } from './empty-lane-overview';

import styles from './lanes-readme.module.scss';

export type LaneReadmeProps = {
  host: string;
  readmeComponent: ComponentModel;
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
    return <ReactRouter.Redirect to={`${LanesModel.getLaneUrl(currentLane.id)}/~gallery`} />;
  }

  return null;
}

function LaneReadme({ host, readmeComponent, currentLane }: LaneReadmeProps) {
  const { component, componentDescriptor } = useComponent(host, readmeComponent.id);

  if (!component) {
    return null;
  }

  const laneComponents = currentLane.components;
  const hasComponents = laneComponents.length > 0;
  const emptyLane = (
    <EmptyLane
      className={styles.emptyLane}
      message={'Start by snapping components to this Lane.'}
      name={currentLane.name}
      title={'Snap components to'}
    />
  );

  return (
    <LanesProvider viewedLaneId={undefined}>
      <ComponentProvider component={component}>
        <ComponentDescriptorProvider componentDescriptor={componentDescriptor}>
          <div className={styles.readmeContainer}>
            <LaneDetails className={styles.laneId} laneName={currentLane.id}></LaneDetails>

            <Separator isPresentational />
            <Overview />
            {hasComponents || emptyLane}
            {hasComponents && <H5 className={styles.carouselTitle}>Components</H5>}
            {hasComponents && (
              <Carousel animation={true} className={styles.laneCarousel}>
                {laneComponents.map((laneComponent) => (
                  <ComponentCard
                    key={laneComponent.id.fullName}
                    id={laneComponent.id.fullName}
                    href={LanesModel.getLaneComponentUrl(laneComponent.id, currentLane.id)}
                    envIcon={laneComponent.environment?.icon}
                    description={laneComponent.description}
                    version={laneComponent.version === 'new' ? undefined : laneComponent.version}
                    preview={<PreviewPlaceholder component={component} shouldShowPreview={true} />}
                  />
                ))}
              </Carousel>
            )}
          </div>
        </ComponentDescriptorProvider>
      </ComponentProvider>
    </LanesProvider>
  );
}
