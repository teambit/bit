import React from 'react';
import { textColumn } from '@teambit/base-ui.layout.page-frame';
import { ConsumableLink } from '@teambit/documenter.ui.consumable-link';
import { H1 } from '@teambit/documenter.ui.heading';
import { LabelList } from '@teambit/documenter.ui.label-list';
import { Section } from '@teambit/documenter.ui.section';
import { Separator } from '@teambit/design.ui.separator';
import { Subtitle } from '@teambit/documenter.ui.sub-title';
import styles from './component-overview.module.scss';

export type ComponentOverviewProps = {
  displayName: string;
  abstract?: string;
  version: string;
  labels: string[];
  packageName: string;
};

export function ComponentOverview({ displayName, abstract, labels, packageName, ...rest }: ComponentOverviewProps) {
  return (
    <Section {...rest}>
      <div className={textColumn}>
        <H1>{displayName}</H1>
        {abstract && <Subtitle className={styles.subTitle}>{abstract}</Subtitle>}
        <LabelList>{labels}</LabelList>
        <ConsumableLink title="Package name" link={packageName}></ConsumableLink>
      </div>
      <Separator isPresentational />
    </Section>
  );
}
