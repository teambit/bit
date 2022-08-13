import React, { HTMLAttributes } from 'react';
import { EmptyBox } from '@teambit/design.ui.empty-box';

export type ComponentPipelineBlankStateProps = {} & HTMLAttributes<HTMLDivElement>;

export function ComponentPipelineBlankState({ className }: ComponentPipelineBlankStateProps) {
  return (
    <EmptyBox
      className={className}
      title="Run Tag or Snap to view the pipeline report"
      linkText="Learn more about pipelines"
      link={`https://bit.dev/docs/dev-services/builder/build-pipelines`}
    />
  );
}
