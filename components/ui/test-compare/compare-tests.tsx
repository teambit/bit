import { CompareSplitLayoutPreset } from '@teambit/component.ui.component-compare.layouts.compare-split-layout-preset';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import type { EmptyStateSlot } from '@teambit/compositions';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import type { HTMLAttributes } from 'react';
import React, { useMemo } from 'react';
import { CompareTestsPage } from './compare-tests-page';
import styles from './compare-tests.module.scss';

export type CompareTestsProps = {
  emptyState: EmptyStateSlot;
} & HTMLAttributes<HTMLDivElement>;

export function CompareTests(props: CompareTestsProps) {
  const { emptyState } = props;
  const componentCompare = useComponentCompare();

  const BaseLayout = useMemo(() => {
    if (componentCompare?.base === undefined) {
      return null;
    }

    return (
      <div className={styles.subView}>
        <CompareTestsPage component={componentCompare.base?.model} emptyState={emptyState} />
      </div>
    );
  }, [componentCompare?.base]);

  const CompareLayout = useMemo(() => {
    if (componentCompare?.compare === undefined) {
      return null;
    }

    return (
      <div className={styles.subView}>
        <CompareTestsPage
          component={componentCompare.compare.model}
          isCompareVersionWorkspace={componentCompare.compare.hasLocalChanges}
          emptyState={emptyState}
        />
      </div>
    );
  }, [componentCompare?.compare]);

  const key = `${componentCompare?.base?.model.id.toString()}-${componentCompare?.compare?.model.id.toString()}-compare-tests`;

  return (
    <React.Fragment key={key}>
      {componentCompare?.loading && (
        <div className={styles.loader}>
          <RoundLoader />
        </div>
      )}
      <CompareSplitLayoutPreset base={BaseLayout} compare={CompareLayout} className={styles.splitLayout} />
    </React.Fragment>
  );
}
