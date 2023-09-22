import React, { useMemo, useState } from 'react';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { CompositionContent, CompositionContentProps, EmptyStateSlot } from '@teambit/compositions';
import { CompositionContextProvider } from '@teambit/compositions.ui.hooks.use-composition';
import {
  useCompareQueryParam,
  useUpdatedUrlFromQuery,
} from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { uniqBy } from 'lodash';
import { CompareSplitLayoutPreset } from '@teambit/component.ui.component-compare.layouts.compare-split-layout-preset';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import queryString from 'query-string';
import { CompositionDropdown } from './composition-dropdown';
import { CompositionCompareContext } from './composition-compare.context';

import styles from './composition-compare.module.scss';

export type CompositionCompareProps = {
  emptyState?: EmptyStateSlot;
  Widgets?: {
    Right?: React.ReactNode;
    Left?: React.ReactNode;
  };
  previewViewProps?: CompositionContentProps;
  PreviewView?: React.ComponentType<CompositionContentProps>;
};

export function CompositionCompare(props: CompositionCompareProps) {
  const { emptyState, PreviewView = CompositionContent, Widgets, previewViewProps = {} } = props;

  const componentCompareContext = useComponentCompare();

  const { base, compare, baseContext, compareContext } = componentCompareContext || {};

  const baseCompositions = base?.model.compositions;
  const compareCompositions = compare?.model.compositions;

  const selectedCompositionBaseFile = useCompareQueryParam('compositionBaseFile');
  const selectedCompositionCompareFile = useCompareQueryParam('compositionCompareFile');

  const baseState = baseContext?.state?.preview;
  const compareState = compareContext?.state?.preview;
  const baseHooks = baseContext?.hooks?.preview;
  const compareHooks = compareContext?.hooks?.preview;
  const selectedBaseFromState = baseState?.id;
  const selectedCompareFromState = compareState?.id;

  const selectedBaseCompositionId = selectedBaseFromState || selectedCompositionBaseFile;
  const selectedCompositionCompareId = selectedCompareFromState || selectedCompositionCompareFile;

  const selectedBaseComp =
    (selectedBaseCompositionId &&
      baseCompositions &&
      baseCompositions.find((c) => {
        return c.identifier === selectedBaseCompositionId;
      })) ||
    (baseCompositions && baseCompositions[0]);

  const selectedCompareComp =
    (selectedCompositionCompareId &&
      compareCompositions &&
      compareCompositions.find((c) => {
        return c.identifier === selectedCompositionCompareId;
      })) ||
    (compareCompositions && compareCompositions[0]);

  const compositionsDropdownSource = uniqBy(baseCompositions?.concat(compareCompositions || []), 'identifier')?.map(
    (c) => {
      const href = !compareState?.controlled
        ? useUpdatedUrlFromQuery({
            compositionBaseFile: selectedBaseComp?.identifier,
            compositionCompareFile: c.identifier,
          })
        : useUpdatedUrlFromQuery({});

      const onClick = compareState?.controlled
        ? (_, __) => {
            compareHooks?.onClick?.(_, __);
            baseHooks?.onClick?.(_, __);
          }
        : undefined;
      return { id: c.identifier, label: c.displayName, href, onClick };
    }
  );

  const [baseCompositionParams, setBaseCompositionParams] = useState<Record<string, any>>({});
  const baseCompQueryParams = useMemo(() => queryString.stringify(baseCompositionParams), [baseCompositionParams]);

  const [compareCompositionParams, setCompareCompositionParams] = useState<Record<string, any>>({});
  const compareCompQueryParams = useMemo(
    () => queryString.stringify(compareCompositionParams),
    [compareCompositionParams]
  );

  const selectedCompareDropdown = selectedCompareComp && {
    id: selectedCompareComp.identifier,
    label: selectedCompareComp.displayName,
  };

  const BaseLayout = useMemo(() => {
    if (base === undefined) {
      return null;
    }
    const baseCompModel = base.model;
    const compositionProps = {
      forceHeight: undefined,
      innerBottomPadding: 50,
      ...previewViewProps,
      emptyState,
      component: baseCompModel,
      queryParams: baseCompQueryParams,
      selected: selectedCompareComp,
    };
    return (
      <div className={styles.subView}>
        <CompositionCompareContext.Provider value={{ compositionProps, isBase: true }}>
          <CompositionContextProvider queryParams={baseCompositionParams} setQueryParams={setBaseCompositionParams}>
            <PreviewView
              forceHeight={undefined}
              innerBottomPadding={50}
              {...previewViewProps}
              emptyState={emptyState}
              component={baseCompModel}
              selected={selectedCompareComp}
              queryParams={baseCompQueryParams}
            />
          </CompositionContextProvider>
        </CompositionCompareContext.Provider>
      </div>
    );
  }, [base, selectedCompareComp?.identifier]);

  const CompareLayout = useMemo(() => {
    if (compare === undefined) {
      return null;
    }
    const compareCompModel = compare.model;
    const compositionProps = {
      forceHeight: undefined,
      innerBottomPadding: 50,
      ...previewViewProps,
      emptyState,
      component: compareCompModel,
      queryParams: compareCompQueryParams,
      selected: selectedCompareComp,
    };
    return (
      <div className={styles.subView}>
        <CompositionCompareContext.Provider value={{ compositionProps, isCompare: true }}>
          <CompositionContextProvider
            queryParams={compareCompositionParams}
            setQueryParams={setCompareCompositionParams}
          >
            <PreviewView
              forceHeight={undefined}
              innerBottomPadding={50}
              {...previewViewProps}
              emptyState={emptyState}
              component={compareCompModel}
              queryParams={compareCompQueryParams}
              selected={selectedCompareComp}
            />
          </CompositionContextProvider>
        </CompositionCompareContext.Provider>
      </div>
    );
  }, [compare, selectedCompareComp?.identifier]);

  const CompositionToolbar = () => {
    if (!base && !compare) {
      return null;
    }

    return (
      <div className={styles.toolbar}>
        <div className={styles.left}>
          <div className={styles.dropdown}>
            {compositionsDropdownSource.length > 0 && (
              <CompositionDropdown dropdownItems={compositionsDropdownSource} selected={selectedCompareDropdown} />
            )}
          </div>
          <div className={styles.widgets}>{Widgets?.Left}</div>
        </div>
        <div className={styles.right}>
          <div className={styles.widgets}>{Widgets?.Right}</div>
        </div>
      </div>
    );
  };

  const key = `${componentCompareContext?.base?.model.id.toString()}-${componentCompareContext?.compare?.model.id.toString()}-composition-compare`;

  return (
    <React.Fragment key={key}>
      {componentCompareContext?.loading && (
        <div className={styles.loader}>
          <RoundLoader />
        </div>
      )}
      <CompositionToolbar />
      <CompareSplitLayoutPreset base={BaseLayout} compare={CompareLayout} />
    </React.Fragment>
  );
}
