import React, { HTMLAttributes } from 'react';
import { EmptyBox } from '@teambit/design.ui.empty-box';

export type ComponentCompareBlankStateProps = {} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareBlankState({ className }: ComponentCompareBlankStateProps) {
  return (
    <EmptyBox
      className={className}
      title="This component doesn't have multiple versions or snaps to compare."
      linkText="Learn more about tagging and snapping components"
      link={`https://bit.dev/docs/getting-started/collaborate/snap-component-changes`}
    />
  );
}
