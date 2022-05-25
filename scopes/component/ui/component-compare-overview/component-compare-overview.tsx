import React from 'react';
import styles from './component-compare-overview.module.scss';
import { useComponentCompareContext } from '@teambit/component.ui.component-compare';
import { ComponentProvider, ComponentDescriptorProvider } from '@teambit/component';
import { Overview, TitleBadgeSlot } from '@teambit/docs';

export type ComponentCompareOverviewProps = {
  titleBadges: TitleBadgeSlot;
};

export function ComponentCompareOverview(props: ComponentCompareOverviewProps) {
  const { titleBadges } = props;
  const componentCompare = useComponentCompareContext();
  if (componentCompare === undefined) {
    return <></>;
  }

  const { base, compare } = componentCompare;

  return (
    <div className={styles.mainContainer}>
      <div className={styles.subContainerLeft}>
        <div className={styles.subView}>
          <ComponentProvider component={base}>
            <Overview titleBadges={titleBadges} />
          </ComponentProvider>
        </div>
      </div>
      <div className={styles.subContainerRight}>
        <div className={styles.subView}>
          <ComponentProvider component={compare}>
            <Overview titleBadges={titleBadges} />
          </ComponentProvider>
        </div>
      </div>
    </div>
  );
}
