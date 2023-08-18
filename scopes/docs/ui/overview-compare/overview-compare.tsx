import { ComponentProvider } from '@teambit/component';
import { CompareSplitLayoutPreset } from '@teambit/component.ui.component-compare.layouts.compare-split-layout-preset';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { Overview } from '@teambit/docs';
import type { TitleBadgeSlot, OverviewOptionsSlot } from '@teambit/docs';
import React, { useMemo, useRef } from 'react';
import { ComponentPreviewProps } from '@teambit/preview.ui.component-preview';

import styles from './overview-compare.module.scss';

export type OverviewCompareProps = {
  titleBadges: TitleBadgeSlot;
  overviewOptions: OverviewOptionsSlot;
  previewProps?: ComponentPreviewProps;
  Widgets?: {
    Right?: React.ReactNode;
    Left?: React.ReactNode;
  };
};

export function OverviewCompare(props: OverviewCompareProps) {
  const { titleBadges, overviewOptions, previewProps, Widgets } = props;
  const componentCompare = useComponentCompare();

  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  const BaseLayout = useMemo(() => {
    if (componentCompare?.base === undefined) {
      return null;
    }

    return (
      <div className={styles.subView} ref={leftPanelRef}>
        <ComponentProvider component={componentCompare.base.model}>
          <Overview titleBadges={titleBadges} overviewOptions={overviewOptions} previewProps={previewProps} />
        </ComponentProvider>
      </div>
    );
  }, [componentCompare?.base]);

  const CompareLayout = useMemo(() => {
    if (componentCompare?.compare === undefined) {
      return null;
    }

    return (
      <div className={styles.subView} ref={rightPanelRef}>
        <ComponentProvider component={componentCompare.compare.model}>
          <Overview titleBadges={titleBadges} overviewOptions={overviewOptions} previewProps={previewProps} />
        </ComponentProvider>
      </div>
    );
  }, [componentCompare?.compare]);

  const OverviewToolbar = () => {
    if (!componentCompare?.base && !componentCompare?.compare) {
      return null;
    }

    return (
      <div className={styles.toolbar}>
        {componentCompare?.base && (
          <div className={styles.left}>
            <div className={styles.widgets}>{Widgets?.Left}</div>
          </div>
        )}
        <div className={styles.right}>
          <div className={styles.widgets}>{Widgets?.Right}</div>
        </div>
      </div>
    );
  };

  return (
    <React.Fragment key="overview-compare">
      {componentCompare?.loading && (
        <div className={styles.loader}>
          <RoundLoader />
        </div>
      )}
      {/* <div className={styles.checkboxContainer}>
        <div className={styles.toggleContainer}>
          <Toggle checked={isScrollingSynced} onInputChanged={handleScrollingSyncChange} className={styles.toggle} />
          Synchronize Scrolling
        </div>
      </div> */}
      <OverviewToolbar />
      <CompareSplitLayoutPreset
        key={`${componentCompare?.base?.model.id.toString()}-${componentCompare?.compare?.model.id.toString()}-overview-split-layout`}
        base={BaseLayout}
        compare={CompareLayout}
        className={styles.splitLayout}
      />
    </React.Fragment>
  );
}
