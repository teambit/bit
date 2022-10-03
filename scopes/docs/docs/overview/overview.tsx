import React, { useContext, ComponentType } from 'react';
import classNames from 'classnames';
import { flatten } from 'lodash';
import { ComponentContext, useComponentDescriptor } from '@teambit/component';
import type { SlotRegistry } from '@teambit/harmony';
import { ComponentPreview } from '@teambit/preview.ui.component-preview';
import { StatusMessageCard } from '@teambit/design.ui.surfaces.status-message-card';
import { ComponentOverview } from '@teambit/component.ui.component-meta';

import styles from './overview.module.scss';

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

export type TitleBadgeSlot = SlotRegistry<TitleBadge[]>;

export type OverviewProps = {
  titleBadges: TitleBadgeSlot;
};

export function Overview({ titleBadges }: OverviewProps) {
  const component = useContext(ComponentContext);
  const componentDescriptor = useComponentDescriptor();

  const showHeader = !component.preview?.legacyHeader;

  if (component?.buildStatus === 'pending' && component?.host === 'teambit.scope/scope')
    return (
      <StatusMessageCard style={{ margin: 'auto' }} status="PROCESSING" title="component preview pending">
        this might take some time
      </StatusMessageCard>
    );

  // if (component?.buildStatus === 'failed' && component?.host === 'teambit.scope/scope')
  //   return <StatusMessageCard style={{ margin: 'auto' }} status="FAILURE" title="failed to get component preview " />;

  const isScaling = component.preview?.isScaling;

  return (
    <div className={styles.overviewWrapper}>
      {showHeader && (
        <ComponentOverview
          className={classNames(styles.componentOverviewBlock, !isScaling && styles.legacyPreview)}
          displayName={component.displayName}
          version={component.version}
          abstract={component.description}
          labels={component.labels}
          packageName={component.packageName}
          titleBadges={flatten(titleBadges.values())}
          componentDescriptor={componentDescriptor}
          component={component}
        />
      )}
      <ComponentPreview
        component={component}
        style={{ width: '100%', height: '100%' }}
        previewName="overview"
        pubsub={true}
        viewport={null}
        fullContentHeight
        scrolling="no"
      />
    </div>
  );
}
