import { ComponentProvider } from '@teambit/component';
import { CompareSplitLayoutPreset } from '@teambit/component.ui.component-compare.layouts.compare-split-layout-preset';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { Toggle } from '@teambit/design.inputs.toggle-switch';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { Overview } from '@teambit/docs';
import type { TitleBadgeSlot, OverviewOptionsSlot } from '@teambit/docs';
import React, { UIEvent, useMemo, useRef, useState } from 'react';

import styles from './overview-compare.module.scss';

export type OverviewCompareProps = {
  titleBadges: TitleBadgeSlot;
  overviewOptions: OverviewOptionsSlot;
};

export function OverviewCompare(props: OverviewCompareProps) {
  const { titleBadges, overviewOptions } = props;
  const componentCompare = useComponentCompare();
  const [isScrollingSynced, setIsScrollingSynced] = useState<boolean>(true);

  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  function handleLeftPanelScroll(event: UIEvent<HTMLDivElement>) {
    if (!isScrollingSynced) return;

    rightPanelRef.current?.scrollTo({ top: event.currentTarget?.scrollTop, left: event.currentTarget?.scrollLeft });
  }

  function handleRightPanelScroll(event: UIEvent<HTMLDivElement>) {
    if (!isScrollingSynced) return;

    leftPanelRef.current?.scrollTo({ top: event.currentTarget?.scrollTop, left: event.currentTarget?.scrollLeft });
  }

  function handleScrollingSyncChange() {
    rightPanelRef.current?.scrollTo({ top: leftPanelRef.current?.scrollTop, left: leftPanelRef.current?.scrollLeft });
    setIsScrollingSynced((prev) => !prev);
  }

  const BaseLayout = useMemo(() => {
    if (componentCompare?.base === undefined) {
      return <></>;
    }

    return (
      <div className={styles.subView} ref={leftPanelRef} onScroll={handleLeftPanelScroll}>
        <ComponentProvider component={componentCompare.base.model}>
          <Overview titleBadges={titleBadges} overviewOptions={overviewOptions} />
        </ComponentProvider>
      </div>
    );
  }, [componentCompare?.base, isScrollingSynced]);

  const CompareLayout = useMemo(() => {
    if (componentCompare?.compare === undefined) {
      return <></>;
    }

    return (
      <div className={styles.subView} ref={rightPanelRef} onScroll={handleRightPanelScroll}>
        <ComponentProvider component={componentCompare.compare.model}>
          <Overview titleBadges={titleBadges} overviewOptions={overviewOptions} />
        </ComponentProvider>
      </div>
    );
  }, [componentCompare?.compare, isScrollingSynced]);

  return (
    <>
      {componentCompare?.loading && (
        <div className={styles.loader}>
          <RoundLoader />
        </div>
      )}
      <div className={styles.checkboxContainer}>
        <div className={styles.toggleContainer}>
          <Toggle checked={isScrollingSynced} onInputChanged={handleScrollingSyncChange} className={styles.toggle} />
          Synchronize Scrolling
        </div>
      </div>
      <CompareSplitLayoutPreset base={BaseLayout} compare={CompareLayout} className={styles.splitLayout} />
    </>
  );
}
