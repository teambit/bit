import { ComponentProvider } from '@teambit/component';
import { CompareSplitLayoutPreset } from '@teambit/component.ui.component-compare.layouts.compare-split-layout-preset';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { Toggle } from '@teambit/design.ui.input.toggle';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { Overview } from '@teambit/docs';
import type { TitleBadgeSlot } from '@teambit/docs';
import React, { UIEvent, useMemo, useRef, useState } from 'react';
import { useLanes, LanesContext, LanesContextModel } from '@teambit/lanes.hooks.use-lanes';

import styles from './overview-compare.module.scss';

export type OverviewCompareProps = {
  titleBadges: TitleBadgeSlot;
};

export function OverviewCompare(props: OverviewCompareProps) {
  const { titleBadges } = props;
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

  const { lanesModel, updateLanesModel } = useLanes();

  const BaseLayout = useMemo(() => {
    if (componentCompare?.base === undefined) {
      return <></>;
    }

    // const baseVersion = componentCompare?.base.model.version;
    const baseId = componentCompare?.base.model.id;

    // const isBaseOnLane = !!lanesModel?.lanebyComponentHash.get(baseVersion);
    const isBaseOnLane = !!lanesModel?.isComponentOnNonDefaultLanes(baseId, true);

    const lanesContext: LanesContextModel | undefined = isBaseOnLane ? { lanesModel, updateLanesModel } : undefined;

    return (
      <div className={styles.subView} ref={leftPanelRef} onScroll={handleLeftPanelScroll}>
        <LanesContext.Provider value={lanesContext}>
          <ComponentProvider component={componentCompare.base.model}>
            <Overview titleBadges={titleBadges} />
          </ComponentProvider>
        </LanesContext.Provider>
      </div>
    );
  }, [componentCompare?.base, isScrollingSynced]);

  const CompareLayout = useMemo(() => {
    if (componentCompare?.compare === undefined) {
      return <></>;
    }

    // const compareVersion = componentCompare?.compare.model.version;
    const compareId = componentCompare?.compare.model.id;

    const isCompareOnLane = !!lanesModel?.isComponentOnNonDefaultLanes(compareId, true);
    const lanesContext: LanesContextModel | undefined = isCompareOnLane ? { lanesModel, updateLanesModel } : undefined;

    return (
      <div className={styles.subView} ref={rightPanelRef} onScroll={handleRightPanelScroll}>
        <LanesContext.Provider value={lanesContext}>
          <ComponentProvider component={componentCompare.compare.model}>
            <Overview titleBadges={titleBadges} />
          </ComponentProvider>
        </LanesContext.Provider>
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
