import React from 'react';
import classNames from 'classnames';
import { Section } from '@bit/bit.test-scope.ui.section';
import { H1 } from '@bit/bit.test-scope.ui.heading';
import { Subtitle } from '@bit/bit.test-scope.ui.sub-title';
import { Separator } from '@bit/bit.test-scope.ui.separator';
import { ConsumableLink } from '@bit/bit.test-scope.ui.consumable-link';
import { LabelList } from '@bit/bit.test-scope.ui.label-list';
import styles from './component-overview.module.scss';

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
      <H1 className={classNames(styles.maxWidth, styles.heading)}>{displayName}</H1>
      <Subtitle className={styles.maxWidth}>{abstract}</Subtitle>
      <LabelList>{labels}</LabelList>
      <ConsumableLink className={styles.maxWidth} title="Package name" link={packageName}></ConsumableLink>
      <Separator />
    </Section>
  );
}
