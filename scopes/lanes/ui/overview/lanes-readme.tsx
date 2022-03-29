import React from 'react';
import { ReactRouter } from '@teambit/react-router';
import { LanesProvider, LaneComponentModel, useLanesContext, LaneModel, LaneDetails } from '@teambit/lanes.ui.lanes';
import { ComponentProvider, useComponent } from '@teambit/component';
import { Overview } from '@teambit/docs';
import { Carousel } from '@teambit/design.content.carousel';
import { ComponentCard } from '@teambit/explorer.ui.gallery.component-card';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import { H5 } from '@teambit/documenter.ui.heading';
import { ComponentDescriptorProvider } from '@teambit/component';
import { Separator } from '@teambit/design.ui.separator';

import styles from './lanes-readme.module.scss';
import { EmptyLane } from './empty-lane-overview';

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
  const { component, componentDescriptor } = useComponent(host, readmeComponent.model.id);

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
    <LanesProvider currentLaneId={undefined}>
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
            )}
          </div>
        </ComponentDescriptorProvider>
      </ComponentProvider>
    </LanesProvider>
  );
}
