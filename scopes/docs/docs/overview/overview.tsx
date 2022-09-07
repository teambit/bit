import React, { useContext, ComponentType } from 'react';
import classNames from 'classnames';
import { flatten } from 'lodash';
import { ComponentContext, useComponentDescriptor } from '@teambit/component';
import type { SlotRegistry } from '@teambit/harmony';
import { ComponentPreview } from '@teambit/preview.ui.component-preview';
import { StatusMessageCard } from '@teambit/design.ui.surfaces.status-message-card';
import { ComponentOverview } from '@teambit/component.ui.component-meta';
import { Separator } from '@teambit/design.ui.separator';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneBreadcrumb } from '@teambit/lanes.ui.gallery';

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

// used to determine if the component got the preview scaling update,
// which happens automatically on core envs
const CORE_ENV_IDS = [
  'teambit.harmony/aspect',
  'teambit.react/react',
  'teambit.harmony/node',
  'teambit.react/react-native',
  'teambit.html/html',
  'teambit.mdx/mdx',
  'teambit.envs/env',
  'teambit.mdx/readme'
]

export function Overview({ titleBadges }: OverviewProps) {
  const component = useContext(ComponentContext);
  const componentDescriptor = useComponentDescriptor();
  const { lanesModel } = useLanes();
  const currentLane = lanesModel?.viewedLane;

  const showHeader = !component.preview?.legacyHeader;

  const isCoreEnv = component?.environment?.id && CORE_ENV_IDS.includes(component?.environment?.id)

  if (component?.buildStatus === 'pending' && component?.host === 'teambit.scope/scope')
    return (
      <StatusMessageCard style={{ margin: 'auto' }} status="PROCESSING" title="component preview pending">
        this might take some time
      </StatusMessageCard>
    );
      
  if (component?.buildStatus === 'failed' && component?.host === 'teambit.scope/scope')
    return <StatusMessageCard style={{ margin: 'auto' }} status="FAILURE" title="failed to get component preview " />;
  const isScaling = component.preview?.isScaling || isCoreEnv;

  return (
    <div className={styles.overviewWrapper}>
      {currentLane && <LaneBreadcrumb lane={currentLane} />}
      {currentLane && <Separator isPresentational />}
      {showHeader && (
        <ComponentOverview
          className={classNames(styles.componentOverviewBlock, !isScaling && styles.previewNotScaling)}
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
