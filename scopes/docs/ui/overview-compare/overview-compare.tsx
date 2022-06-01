import { ComponentProvider } from '@teambit/component';
import { useComponentCompareContext } from '@teambit/component.ui.compare';
import { Toggle } from '@teambit/design.ui.input.toggle';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { Overview, TitleBadgeSlot } from '@teambit/docs';
import React, { UIEvent, useRef, useState } from 'react';
import styles from './overview-compare.module.scss';

export type OverviewCompareProps = {
  titleBadges: TitleBadgeSlot;
};

export function OverviewCompare(props: OverviewCompareProps) {
  const { titleBadges } = props;
  const componentCompare = useComponentCompareContext();
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

  if (componentCompare === undefined || !componentCompare.base) {
    return <></>;
  }

  return (
    <>
      {componentCompare.loading && (
        <div className={styles.loader}>
          <RoundLoader />
        </div>
      )}
      <div className={styles.checkboxContainer}>
        <div className={styles.toggleContainer}>
          <Toggle checked={isScrollingSynced} onInputChanged={handleScrollingSyncChange} className={styles.toggle}/>
          Synchronize Scrolling
        </div>
      </div>
      <div className={styles.mainContainer}>
        <div className={styles.subContainerLeft}>
          <div className={styles.subView} ref={leftPanelRef} onScroll={handleLeftPanelScroll}>
            <ComponentProvider component={componentCompare.base}>
              <Overview titleBadges={titleBadges} />
            </ComponentProvider>
          </div>
        </div>
        <div className={styles.subContainerRight}>
          <div className={styles.subView} ref={rightPanelRef} onScroll={handleRightPanelScroll}>
            <ComponentProvider component={componentCompare.compare}>
              <Overview titleBadges={titleBadges} />
            </ComponentProvider>
          </div>
        </div>
      </div>
    </>
  );
}
