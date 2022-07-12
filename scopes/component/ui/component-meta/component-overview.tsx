import React, { ComponentType } from 'react';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import { textColumn } from '@teambit/base-ui.layout.page-frame';
import { ConsumableLink } from '@teambit/documenter.ui.consumable-link';
import { H1 } from '@teambit/documenter.ui.heading';
import { LabelList } from '@teambit/documenter.ui.label-list';
import { Section, SectionProps } from '@teambit/documenter.ui.section';
import { Separator } from '@teambit/design.ui.separator';
import { Subtitle } from '@teambit/documenter.ui.sub-title';
import { isBrowser } from '@teambit/ui-foundation.ui.is-browser';
import { Row } from '@teambit/base-react.layout.row';
import { ComponentModel } from '@teambit/component';
import styles from './component-overview.module.scss';

export enum BadgePosition {
  Title,
  SubTitle,
  Labels,
  Package,
  ElementsPackage,
}

export type TitleBadge = {
  component: ComponentType<any>;
  weight?: number;
  position?: BadgePosition;
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
        <div className={styles.titleRow}>
          <Row>
            <div className={styles.componentTitle}>
              <H1>{displayName}</H1>
            </div>
            <BadgeSection
              position={BadgePosition.Title}
              componentDescriptor={componentDescriptor}
              component={component}
              badges={titleBadges}
            />
          </Row>
        </div>
        <Row>
          {abstract && (
            <>
              <Subtitle className={styles.subTitle}>{abstract}</Subtitle>
              <BadgeSection
                position={BadgePosition.SubTitle}
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
            position={BadgePosition.Labels}
            componentDescriptor={componentDescriptor}
            component={component}
            badges={titleBadges}
          />
        </Row>
        <Row>
          <ConsumableLink title="Package name" link={packageName}></ConsumableLink>
          <BadgeSection
            position={BadgePosition.Package}
            componentDescriptor={componentDescriptor}
            component={component}
            badges={titleBadges}
          />
        </Row>
        {finalElementsUrl && (
          <Row>
            <ConsumableLink title="Elements url" link={finalElementsUrl}></ConsumableLink>
            <BadgeSection
              position={BadgePosition.ElementsPackage}
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
  position: BadgePosition;
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
            (position === BadgePosition.Title && !badge.position) || // default position is title
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
