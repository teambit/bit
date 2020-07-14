import React from 'react';
import { textColumn } from '@bit/bit.base-ui.layout.page-frame';
import { Section } from '@bit/bit.test-scope.ui.section';
import { H1 } from '@bit/bit.test-scope.ui.heading';
import { Subtitle } from '@bit/bit.test-scope.ui.sub-title';
import { Separator } from '@bit/bit.test-scope.ui.separator';
import { ConsumableLink } from '@bit/bit.test-scope.ui.consumable-link';
import { LabelList } from '@bit/bit.test-scope.ui.label-list';

export type ComponentOverviewProps = {
  displayName: string;
  abstract: string;
  version: string;
  labels: string[];
  packageName: string;
};

export function ComponentOverview({ displayName, abstract, labels, packageName, ...rest }: ComponentOverviewProps) {
  return (
    <Section {...rest}>
      <div className={textColumn}>
        <H1>{displayName}</H1>
        <Subtitle>{abstract}</Subtitle>
        <LabelList>{labels}</LabelList>
        <ConsumableLink title="Package name" link={packageName}></ConsumableLink>
      </div>
      <Separator />
    </Section>
  );
}
