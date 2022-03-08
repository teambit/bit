import React from 'react';
import { LanesProvider, LaneComponentModel, useLanesContext } from '@teambit/lanes.ui.lanes';
import { ComponentProvider, useComponent } from '@teambit/component';
import { Overview } from '@teambit/docs';
import styles from './lanes-readme.module.scss';
import { EmptyLane } from './empty-lane-overview';

export type LaneReadmeProps = {
  host: string;
  readmeComponent: LaneComponentModel;
};

export type LaneReadmeWrapperProps = {
  host: string;
};

export function LaneReadmeWrapper({ host }: LaneReadmeWrapperProps) {
  const lanesContext = useLanesContext();
  const readmeComponent = lanesContext?.currentLane?.readmeComponent;

  if (!readmeComponent)
    return (
      <EmptyLane
        message={'Run bit lane readme-add to add an existing lane component as a readme component'}
        name={lanesContext?.currentLane?.name as string}
        title={'Add Readme Component to'}
      />
    );

  return <LaneReadme host={host} readmeComponent={readmeComponent} />;
}

function LaneReadme({ host, readmeComponent }: LaneReadmeProps) {
  const { component } = useComponent(host, readmeComponent.model.id);
  if (!component) return null;

  return (
    <LanesProvider currentLaneId={undefined}>
      <ComponentProvider component={component}>
        <div className={styles.readmeContainer}>
          <Overview cannotBeConsumed={true} />
        </div>
      </ComponentProvider>
    </LanesProvider>
  );
}
