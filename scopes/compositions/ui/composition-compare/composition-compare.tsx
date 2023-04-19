/* eslint-disable react/prop-types */
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { CompositionContent, CompositionContentProps, EmptyStateSlot } from '@teambit/compositions';
import { CompositionContextProvider } from '@teambit/compositions.ui.hooks.use-composition';
import {
  useCompareQueryParam,
  useUpdatedUrlFromQuery,
} from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { ComponentModel } from '@teambit/component';
import { CompareSplitLayoutPreset } from '@teambit/component.ui.component-compare.layouts.compare-split-layout-preset';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import queryString from 'query-string';
import React, { useMemo, useState } from 'react';
import { CompositionDropdown } from './composition-dropdown';

import styles from './composition-compare.module.scss';

export type CompositionCompareProps = {
  emptyState?: EmptyStateSlot;
  Widgets?: {
    Right?: React.ReactNode;
    Left?: React.ReactNode;
  };
  PreviewView?: React.ComponentType<CompositionContentProps>;
};

export function CompositionCompare(props: CompositionCompareProps) {
  const { emptyState, PreviewView = CompositionContent, Widgets } = props;

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

  const baseCompositionDropdownSource =
    baseCompositions?.map((c) => {
      const href = !baseState?.controlled
        ? useUpdatedUrlFromQuery({
            compositionBaseFile: c.identifier,
            compositionCompareFile: selectedCompareComp?.identifier,
          })
        : useUpdatedUrlFromQuery({});
      const onClick = baseState?.controlled ? baseHooks?.onClick : undefined;

      return { id: c.identifier, label: c.displayName, href, onClick };
    }) || [];

  const compareCompositionDropdownSource =
    compareCompositions?.map((c) => {
      const href = !compareState?.controlled
        ? useUpdatedUrlFromQuery({
            compositionBaseFile: selectedBaseComp?.identifier,
            compositionCompareFile: c.identifier,
          })
        : useUpdatedUrlFromQuery({});
      const onClick = compareState?.controlled ? compareHooks?.onClick : undefined;

      return { id: c.identifier, label: c.displayName, href, onClick };
    }) || [];

  const [baseCompositionParams, setBaseCompositionParams] = useState<Record<string, any>>({});
  const baseCompQueryParams = useMemo(() => queryString.stringify(baseCompositionParams), [baseCompositionParams]);

  const [compareCompositionParams, setCompareCompositionParams] = useState<Record<string, any>>({});
  const compareCompQueryParams = useMemo(
    () => queryString.stringify(compareCompositionParams),
    [compareCompositionParams]
  );

  const selectedBaseDropdown = selectedBaseComp && {
    id: selectedBaseComp.identifier,
    label: selectedBaseComp.displayName,
  };

  const selectedCompareDropdown = selectedCompareComp && {
    id: selectedCompareComp.identifier,
    label: selectedCompareComp.displayName,
  };

  const BaseLayout = useMemo(() => {
    if (base === undefined) {
      return <></>;
    }
    const baseCompModel = base.model;

    return (
      <div className={styles.subView}>
        <CompositionContextProvider queryParams={baseCompositionParams} setQueryParams={setBaseCompositionParams}>
          <PreviewView
            emptyState={emptyState}
            component={baseCompModel}
            selected={selectedBaseComp}
            queryParams={baseCompQueryParams}
          />
        </CompositionContextProvider>
      </div>
    );
  }, [base, selectedBaseComp]);

  const CompareLayout = useMemo(() => {
    if (compare === undefined) {
      return <></>;
    }
    const compareCompModel = compare.model;

    return (
      <div className={styles.subView}>
        <CompositionContextProvider queryParams={compareCompositionParams} setQueryParams={setCompareCompositionParams}>
          <PreviewView
            emptyState={emptyState}
            component={compareCompModel}
            selected={selectedCompareComp}
            queryParams={compareCompQueryParams}
          />
        </CompositionContextProvider>
      </div>
    );
  }, [compare, selectedCompareComp]);

  const CompositionToolbar = () => {
    if (!base && !compare) {
      return null;
    }

    return (
      <div className={styles.toolbar}>
        {base && (
          <div className={styles.left}>
            <div className={styles.dropdown}>
              {baseCompositionDropdownSource.length > 0 && (
                <CompositionDropdown dropdownItems={baseCompositionDropdownSource} selected={selectedBaseDropdown} />
              )}
            </div>
            <div className={styles.widgets}>{Widgets?.Left}</div>
          </div>
        )}
        <div className={styles.right}>
          <div className={styles.dropdown}>
            {compareCompositionDropdownSource.length > 0 && (
              <CompositionDropdown
                dropdownItems={compareCompositionDropdownSource}
                selected={selectedCompareDropdown}
              />
            )}
          </div>
          <div className={styles.widgets}>{Widgets?.Right}</div>
        </div>
      </div>
    );
  };

  return (
    <>
      {componentCompareContext?.loading && (
        <div className={styles.loader}>
          <RoundLoader />
        </div>
      )}
      <CompositionToolbar />
      <CompareSplitLayoutPreset base={BaseLayout} compare={CompareLayout} />
    </>
  );
}
