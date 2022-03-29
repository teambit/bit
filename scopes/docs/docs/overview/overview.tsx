import React, { useContext } from 'react';
import flatten from 'lodash.flatten';
import { ComponentContext, useComponentDescriptor } from '@teambit/component';
import type { SlotRegistry } from '@teambit/harmony';
import { ComponentPreview } from '@teambit/preview.ui.component-preview';
import { StatusMessageCard } from '@teambit/design.ui.surfaces.status-message-card';
import { ComponentOverview, TitleBadge } from '@teambit/component.ui.component-meta';
import { LaneBreadcrumb, useLanesContext } from '@teambit/lanes.ui.lanes';
import { Separator } from '@teambit/design.ui.separator';
import styles from './overview.module.scss';

const ENV_LIST_WITH_DOCS_TEMPLATE = ['react', 'env', 'aspect', 'lit', 'html', 'node', 'mdx', 'react-native']; // envs using react based docs

const ENV_ASPECT_NAME = 'teambit.envs/envs';

export type TitleBadgeSlot = SlotRegistry<TitleBadge[]>;

export type OverviewProps = {
  titleBadges: TitleBadgeSlot;
};

export function Overview({ titleBadges }: OverviewProps) {
  const component = useContext(ComponentContext);
  const componentDescriptor = useComponentDescriptor();
  const lanesModel = useLanesContext();
  const currentLane = lanesModel?.currentLane;

  const envType: string = componentDescriptor?.get<any>(ENV_ASPECT_NAME)?.type;
  const showHeaderOutsideIframe =
    component?.preview?.includesEnvTemplate === false || !ENV_LIST_WITH_DOCS_TEMPLATE.includes(envType);

  if (component?.buildStatus === 'pending' && component?.host === 'teambit.scope/scope')
    return (
      <StatusMessageCard style={{ margin: 'auto' }} status="PROCESSING" title="component preview pending">
        this might take some time
      </StatusMessageCard>
    );
  if (component?.buildStatus === 'failed' && component?.host === 'teambit.scope/scope')
    return (
      <StatusMessageCard
        style={{ margin: 'auto' }}
        status="FAILURE"
        title="failed to get component preview "
      ></StatusMessageCard>
    );

  if (showHeaderOutsideIframe) {
    const badges = flatten(titleBadges.values());

    return (
      <div className={styles.overviewWrapper}>
        <LaneBreadcrumb lane={currentLane} />
        <Separator isPresentational />
        <ComponentOverview
          className={styles.componentOverviewBlock}
          displayName={component.displayName}
          version={component.version}
          abstract={component.description}
          labels={component.labels}
          packageName={component.packageName}
          titleBadges={badges}
          componentDescriptor={componentDescriptor}
        />
        <ComponentPreview
          component={component}
          style={{ width: '100%', height: '100%' }}
          previewName="overview"
          fullContentHeight
          scrolling="no"
        />
      </div>
    );
  }

  return currentLane ? (
    <div className={styles.overviewWrapper}>
      <LaneBreadcrumb lane={currentLane} />
      <Separator isPresentational />
      <ComponentPreview
        component={component}
        style={{ width: '100%', height: '100%' }}
        previewName="overview"
        fullContentHeight
        scrolling="no"
      />
    </div>
  ) : (
    <ComponentPreview
      component={component}
      style={{ width: '100%', height: '100%' }}
      previewName="overview"
      fullContentHeight
    />
  );
}
