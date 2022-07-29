import { ComponentProvider } from '@teambit/component';
import { CompareSplitLayoutPreset, useComponentCompare } from '@teambit/component.ui.compare';
import { Toggle } from '@teambit/design.ui.input.toggle';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { Overview, TitleBadgeSlot } from '@teambit/docs';
import { LanesContext, useLanesContext } from '@teambit/lanes.ui.lanes';
import React, { UIEvent, useMemo, useRef, useState } from 'react';
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

  const lanesModel = useLanesContext();

  const BaseLayout = useMemo(() => {
    if (componentCompare?.base === undefined) {
      return <></>;
    }

    const baseVersion = componentCompare?.base.model.version;

    const isBaseOnLane = !!lanesModel?.lanebyComponentHash.get(baseVersion);
    const lanesContext = isBaseOnLane ? lanesModel : undefined;

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

    const compareVersion = componentCompare?.compare.model.version;

    const isCompareOnLane = !!lanesModel?.lanebyComponentHash.get(compareVersion);
    const lanesContext = isCompareOnLane ? lanesModel : undefined;

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
