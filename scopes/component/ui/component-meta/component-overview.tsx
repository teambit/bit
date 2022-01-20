import React, { ComponentType } from 'react';
import type { ComponentModel } from '@teambit/component';
import { textColumn } from '@teambit/base-ui.layout.page-frame';
import { ConsumableLink } from '@teambit/documenter.ui.consumable-link';
import { H1 } from '@teambit/documenter.ui.heading';
import { LabelList } from '@teambit/documenter.ui.label-list';
import { Section } from '@teambit/documenter.ui.section';
import { Separator } from '@teambit/design.ui.separator';
import { Subtitle } from '@teambit/documenter.ui.sub-title';
import { isBrowser } from '@teambit/ui.is-browser';
import styles from './component-overview.module.scss';

export type TitleBadge = {
  component: ComponentType<{ component: ComponentModel }>;
};

export type ComponentOverviewProps = {
  displayName: string;
  abstract?: string;
  version: string;
  labels: string[];
  packageName: string;
  elementsUrl?: string;
  titleBadges: TitleBadge[];
};

export function ComponentOverview({
  displayName,
  abstract,
  titleBadges,
  labels,
  packageName,
  elementsUrl,
  ...rest
}: ComponentOverviewProps) {
  let finalElementsUrl = elementsUrl;
  if (finalElementsUrl && !finalElementsUrl.startsWith('http')) {
    const origin = isBrowser ? window.location.origin : undefined;
    finalElementsUrl = origin && elementsUrl ? `${origin}${elementsUrl}` : undefined;
  }
  return (
    <Section {...rest}>
      <div className={textColumn}>
        <H1>{displayName}</H1>
        {titleBadges.map((titleBadge) => titleBadge.component)}
        {abstract && <Subtitle className={styles.subTitle}>{abstract}</Subtitle>}
        <LabelList>{labels}</LabelList>
        <ConsumableLink title="Package name" link={packageName}></ConsumableLink>
        {finalElementsUrl && <ConsumableLink title="Elements url" link={finalElementsUrl}></ConsumableLink>}
      </div>
      <Separator isPresentational />
    </Section>
  );
}
