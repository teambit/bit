import React from 'react';
import { LanesProvider, LaneComponentModel, useLanesContext } from '@teambit/lanes.ui.lanes';
import { ComponentProvider, useComponent } from '@teambit/component';
import { Overview } from '@teambit/docs';

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

  if (!readmeComponent) return null;

  return <LaneReadme host={host} readmeComponent={readmeComponent} />;
}

function LaneReadme({ host, readmeComponent }: LaneReadmeProps) {
  const { component } = useComponent(host, readmeComponent.model.id);
  if (!component) return null;

  return (
    <LanesProvider currentLaneId={undefined}>
      <ComponentProvider component={component}>
        <Overview />
      </ComponentProvider>
    </LanesProvider>
  );
}
