import { useComponentCompareContext } from '@teambit/component.ui.component-compare';
import { EmptyStateSlot } from '@teambit/compositions';
import { CheckboxItem } from '@teambit/design.inputs.selectors.checkbox-item';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import React, { HTMLAttributes, UIEvent, useRef, useState } from 'react';
import { ComponentCompareTestsPage } from './component-compare-tests-page';
import styles from './component-compare-tests.module.scss';

export type ComponentCompareTestsProps = {
  emptyState: EmptyStateSlot;
} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareTests(props: ComponentCompareTestsProps) {
  const { emptyState } = props;
  const componentCompare = useComponentCompareContext();
  const [isScrollingSynced, setIsScrollingSynced] = useState<boolean>(true);

  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  function handleLeftPanelScroll(event: UIEvent<HTMLDivElement>) {
    rightPanelRef.current?.scrollTo({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft });
  }

  function handleRightPanelScroll(event: UIEvent<HTMLDivElement>) {
    leftPanelRef.current?.scrollTo({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft });
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
        <CheckboxItem checked={isScrollingSynced} onInputChanged={handleScrollingSyncChange}>
          Synchronize Scrolling
        </CheckboxItem>
      </div>
      <div className={styles.mainContainer}>
        <div className={styles.subContainerLeft}>
          <div className={styles.subView} ref={leftPanelRef} onScroll={handleLeftPanelScroll}>
            <ComponentCompareTestsPage component={componentCompare.base} emptyState={emptyState} />
          </div>
        </div>
        <div className={styles.subContainerRight}>
          <div className={styles.subView} ref={rightPanelRef} onScroll={handleRightPanelScroll}>
            <ComponentCompareTestsPage component={componentCompare.compare} emptyState={emptyState} />
          </div>
        </div>
      </div>
    </>
  );
}
