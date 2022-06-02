import { useUpdatedUrlFromQuery, useComponentCompare, useCompareQueryParam } from '@teambit/component.ui.compare';
import { CompositionContent, EmptyStateSlot } from '@teambit/compositions';
import { CompositionContextProvider } from '@teambit/compositions.ui.hooks.use-composition';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import queryString from 'query-string';
import React, { useMemo, useState } from 'react';
import styles from './composition-compare.module.scss';
import { CompositionDropdown } from './composition-dropdown';

export type CompositionCompareProps = {
  emptyState?: EmptyStateSlot;
};

export function CompositionCompare(props: CompositionCompareProps) {
  const { emptyState } = props;

  const component = useComponentCompare();

  const base = component?.base;
  const compare = component?.compare;

  const baseCompositions = base?.compositions;
  const compareCompositions = compare?.compositions;
  const selectedCompositionBaseFile = useCompareQueryParam('compositionBaseFile');
  const selectedCompositionCompareFile = useCompareQueryParam('compositionCompareFile');

  const selectedBaseComp =
    (selectedCompositionBaseFile &&
      baseCompositions &&
      baseCompositions.find((c) => c.identifier === selectedCompositionBaseFile)) ||
    (baseCompositions && baseCompositions[0]);

  const selectedCompareComp =
    (selectedCompositionCompareFile &&
      compareCompositions &&
      compareCompositions.find((c) => c.identifier === selectedCompositionCompareFile)) ||
    (compareCompositions && compareCompositions[0]);

  const baseCompositionDropdownSource =
    baseCompositions?.map((c) => {
      const href = useUpdatedUrlFromQuery({
        compositionBaseFile: c.identifier,
        compositionCompareFile: selectedCompareComp?.identifier,
      });

      return { id: c.identifier, label: c.displayName, value: href };
    }) || [];

  const compareCompositionDropdownSource =
    compareCompositions?.map((c) => {
      const href = useUpdatedUrlFromQuery({
        compositionBaseFile: selectedBaseComp?.identifier,
        compositionCompareFile: c.identifier,
      });
      return { id: c.identifier, label: c.displayName, value: href };
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

  if (!component || !base || !compare) {
    return <></>;
  }

  return (
    <>
      {component.loading && (
        <div className={styles.loader}>
          <RoundLoader />
        </div>
      )}
      <div className={styles.dropdownContainer}>
        <div className={styles.leftDropdown}>
          <CompositionDropdown dropdownItems={baseCompositionDropdownSource} selected={selectedBaseDropdown} />
        </div>
        <div className={styles.rightDropdown}>
          <CompositionDropdown dropdownItems={compareCompositionDropdownSource} selected={selectedCompareDropdown} />
        </div>
      </div>
      <div className={styles.mainContainer}>
        <div className={styles.subContainerLeft}>
          <div className={styles.subView}>
            <CompositionContextProvider queryParams={baseCompositionParams} setQueryParams={setBaseCompositionParams}>
              <CompositionContent
                emptyState={emptyState}
                component={base}
                selected={selectedBaseComp}
                queryParams={baseCompQueryParams}
              />
            </CompositionContextProvider>
          </div>
        </div>
        <div className={styles.subContainerRight}>
          <div className={styles.subView}>
            <CompositionContextProvider
              queryParams={compareCompositionParams}
              setQueryParams={setCompareCompositionParams}
            >
              <CompositionContent
                emptyState={emptyState}
                component={compare}
                selected={selectedCompareComp}
                queryParams={compareCompQueryParams}
              />
            </CompositionContextProvider>
          </div>
        </div>
      </div>
    </>
  );
}
