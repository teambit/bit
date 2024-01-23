import React from 'react';
import { TabContent, TabContentProps } from '@teambit/ui-foundation.ui.use-box.tab-content';
import { TooltipCopybox } from './tooltip-copybox';

export type ElementsProps = {
  url: string;
  componentName: string;
} & TabContentProps;

export function Elements({ url, componentName, ...rest }: ElementsProps) {
  const copyString = `<script src="${url}"></script>`;
  return (
    <TabContent {...rest}>
      <div>{`Use ${componentName} with script tag`}</div>
      <TooltipCopybox content={copyString} />
    </TabContent>
  );
}
