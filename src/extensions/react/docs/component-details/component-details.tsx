import React from 'react';
import classNames from 'classnames';
import { Section } from '@bit/bit.test-scope.ui.section';
import { H1 } from '@bit/bit.test-scope.ui.heading';
import { Subtitle } from '@bit/bit.test-scope.ui.sub-title';
import { VersionTag } from '@bit/bit.test-scope.ui.version-tag';
import { Separator } from '@bit/bit.test-scope.ui.separator';
import { ConsumableLink } from '@bit/bit.test-scope.ui.consumable-link';
import { LabelList } from '@bit/bit.test-scope.ui.label-list';
import styles from './component-details.module.scss';

export type ComponentDetailsProps = {
  displayName: string;
  abstract: string;
  version: string;
  labels: string;
  packageName: string;
};

export function ComponentDetails({
  displayName,
  abstract,
  version,
  labels,
  packageName,
  ...rest
}: ComponentDetailsProps) {
  console.log('labels', labels);
  return (
    <Section {...rest}>
      <div className={styles.topRow}>
        <H1 className={classNames(styles.maxWidth, styles.marginRight)}>{displayName}</H1>
        <VersionTag className={styles.marginRight}>{version}</VersionTag>
      </div>
      <Subtitle className={styles.marginBottom}>{abstract}</Subtitle>
      <LabelList className={styles.marginBottom}>{labels}</LabelList>
      <Separator className={styles.marginBottom} />
      <Section className={classNames(styles.maxWidth)}>
        <ConsumableLink title="Package name" link={packageName}></ConsumableLink>
      </Section>
    </Section>
  );
}
