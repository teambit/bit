import React, { ComponentType, ReactNode } from 'react';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import { textColumn } from '@teambit/base-ui.layout.page-frame';
import { ConsumableLink } from '@teambit/documenter.ui.consumable-link';
import { H1 } from '@teambit/documenter.ui.heading';
import { LabelList } from '@teambit/documenter.ui.label-list';
import { Section, SectionProps } from '@teambit/documenter.ui.section';
import { Separator } from '@teambit/design.ui.separator';
import { Subtitle } from '@teambit/documenter.ui.sub-title';
import { isBrowser } from '@teambit/ui-foundation.ui.is-browser';
import { ComponentModel } from '@teambit/component';
import styles from './component-overview.module.scss';

export enum TitleBadgePosition {
  Title,
  SubTitle,
  Labels,
  Package,
  ElementsPackage,
}

export type TitleBadge = {
  component: ComponentType<any>;
  weight?: number;
  position?: TitleBadgePosition;
};

export type ComponentOverviewProps = {
  displayName: string;
  abstract?: string;
  version: string;
  labels: string[];
  packageName: string;
  elementsUrl?: string;
  titleBadges?: TitleBadge[];
  componentDescriptor?: ComponentDescriptor;
  component?: ComponentModel;
} & SectionProps;

export function ComponentOverview({
  displayName,
  abstract,
  titleBadges,
  labels,
  packageName,
  elementsUrl,
  componentDescriptor,
  component,
  ...rest
}: ComponentOverviewProps) {
  let finalElementsUrl = elementsUrl;
  if (finalElementsUrl && !finalElementsUrl.startsWith('http')) {
    const origin = isBrowser ? window.location.origin : undefined;
    finalElementsUrl = origin && elementsUrl ? `${origin}${elementsUrl}` : undefined;
  }

  type CompWithTitleBadgesProps = { position: TitleBadgePosition; children: ReactNode };
  function ComponentWithTitleBadges({ position, children }: CompWithTitleBadgesProps) {
    return (
      <div className={styles.componentWithBadgeContainer}>
        {children}
        <div className={styles.badgeContainer}>
          {titleBadges
            // eslint-disable-next-line react/prop-types
            ?.filter((badge) => {
              return (
                (position === TitleBadgePosition.Title && !badge.position) || // default position is title
                badge.position === position
              );
            })
            // @ts-ignore
            ?.sort((a, b) => a?.weight - b?.weight)
            ?.map((titleBadge, index) => {
              return (
                <titleBadge.component
                  key={index}
                  componentDescriptor={componentDescriptor}
                  legacyComponentModel={component}
                />
              );
            })}
        </div>
      </div>
    );
  }

  return (
    <Section {...rest}>
      <div className={textColumn}>
        <ComponentWithTitleBadges position={TitleBadgePosition.Title}>
          <div className={styles.componentTitle}>
            <H1>{displayName}</H1>
          </div>
        </ComponentWithTitleBadges>
        <ComponentWithTitleBadges position={TitleBadgePosition.SubTitle}>
          {abstract && <Subtitle className={styles.subTitle}>{abstract}</Subtitle>}
        </ComponentWithTitleBadges>
        <ComponentWithTitleBadges position={TitleBadgePosition.Labels}>
          <LabelList>{labels}</LabelList>
        </ComponentWithTitleBadges>
        <ComponentWithTitleBadges position={TitleBadgePosition.Package}>
          <ConsumableLink title="Package name" link={packageName}></ConsumableLink>
        </ComponentWithTitleBadges>
        {finalElementsUrl && (
          <ComponentWithTitleBadges position={TitleBadgePosition.ElementsPackage}>
            <ConsumableLink title="Elements url" link={finalElementsUrl}></ConsumableLink>
          </ComponentWithTitleBadges>
        )}
      </div>
      <Separator isPresentational />
    </Section>
  );
}
