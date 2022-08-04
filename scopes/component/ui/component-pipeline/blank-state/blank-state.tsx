import React, { HTMLAttributes } from 'react';
import { EmptyBox } from '@teambit/design.ui.empty-box';

export type ComponentPipelineBlankStateProps = {} & HTMLAttributes<HTMLDivElement>;

export function ComponentPipelineBlankState({ className }: ComponentPipelineBlankStateProps) {
  return (
    <EmptyBox
      className={className}
      title="This component doesn't have any pipelines configured yet. Tag or Snap to run the default tasks"
      linkText="Learn more about pipelines"
      link={`https://bit.dev/docs/dev-services/builder/build-pipelines`}
    />
  );
}
