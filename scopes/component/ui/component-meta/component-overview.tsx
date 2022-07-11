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

  return (
    <Section {...rest}>
      <div className={textColumn}>
        <Row>
          <div className={styles.componentTitle}>
            <H1>{displayName}</H1>
            <BadgeSection
              position={TitleBadgePosition.Title}
              componentDescriptor={componentDescriptor}
              component={component}
              badges={titleBadges}
            />
          </div>
        </Row>
        <Row>
          {abstract && (
            <>
              <Subtitle className={styles.subTitle}>{abstract}</Subtitle>
              <BadgeSection
                position={TitleBadgePosition.SubTitle}
                componentDescriptor={componentDescriptor}
                component={component}
                badges={titleBadges}
              />
            </>
          )}
        </Row>
        <Row>
          <LabelList>{labels}</LabelList>
          <BadgeSection
            position={TitleBadgePosition.Labels}
            componentDescriptor={componentDescriptor}
            component={component}
            badges={titleBadges}
          />
        </Row>
        <Row>
          <ConsumableLink title="Package name" link={packageName}></ConsumableLink>
          <BadgeSection
            position={TitleBadgePosition.Package}
            componentDescriptor={componentDescriptor}
            component={component}
            badges={titleBadges}
          />
        </Row>
        {finalElementsUrl && (
          <Row>
            <ConsumableLink title="Elements url" link={finalElementsUrl}></ConsumableLink>
            <BadgeSection
              position={TitleBadgePosition.ElementsPackage}
              componentDescriptor={componentDescriptor}
              component={component}
              badges={titleBadges}
            />
          </Row>
        )}
      </div>
      <Separator isPresentational />
    </Section>
  );
}

type CompWithTitleBadgesProps = {
  badges: TitleBadge[] | undefined;
  position: TitleBadgePosition;
  componentDescriptor?: ComponentDescriptor;
  component?: ComponentModel;
};
function BadgeSection({ badges, position, componentDescriptor, component }: CompWithTitleBadgesProps) {
  return (
    <div className={styles.badgeContainer}>
      {badges
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
  );
}

// Move to teambit.base-react?
function Row({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}
