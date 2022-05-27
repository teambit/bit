import {
  getComponentCompareUrl,
  useComponentCompareContext,
  useComponentCompareParams,
} from '@teambit/component.ui.component-compare';
import { CompositionContent, EmptyStateSlot } from '@teambit/compositions';
import { CompositionContextProvider } from '@teambit/compositions.ui.hooks.use-composition';
import queryString from 'query-string';
import React, { useMemo, useState } from 'react';
import styles from './component-compare-composition.module.scss';
import { CompositionDropdown } from './composition-dropdown';

export type ComponentCompareCompositionProps = {
  emptyState?: EmptyStateSlot;
};

export function ComponentCompareComposition(props: ComponentCompareCompositionProps) {
  const { emptyState } = props;

  const component = useComponentCompareContext();

  const base = component?.base;
  const compare = component?.compare;

  const baseCompositions = base?.compositions;
  const compareCompositions = compare?.compositions;
  const { ...params } = useComponentCompareParams();

  const selectedBaseComp =
    (params.selectedCompositionBaseFile &&
      baseCompositions &&
      baseCompositions.find((c) => c.identifier === params.selectedCompositionBaseFile)) ||
    (baseCompositions && baseCompositions[0]);

  const selectedCompareComp =
    (params.selectedCompositionCompareFile &&
      compareCompositions &&
      compareCompositions.find((c) => c.identifier === params.selectedCompositionCompareFile)) ||
    (compareCompositions && compareCompositions[0]);

  const baseCompositionDropdownSource =
    baseCompositions?.map((c) => {
      const { ...rest } = useComponentCompareParams();

      const href = getComponentCompareUrl({
        ...rest,
        selectedCompositionBaseFile: c.identifier,
        selectedCompositionCompareFile: selectedCompareComp.identifier,
      });

      return { id: c.identifier, label: c.displayName, value: href };
    }) || [];
    
  const compareCompositionDropdownSource =
    compareCompositions?.map((c) => {
      const { ...rest } = useComponentCompareParams();

      const href = getComponentCompareUrl({
        ...rest,
        selectedCompositionBaseFile: selectedBaseComp.identifier,
        selectedCompositionCompareFile: c.identifier,
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

  if (!component || !base || !compare) {
    return <></>;
  }

  return (
    <>
      <div className={styles.dropdownContainer}>
        <div className={styles.leftDropdown}>
          <CompositionDropdown
            dropdownItems={baseCompositionDropdownSource}
            selected={{ id: selectedBaseComp.identifier, label: selectedBaseComp.displayName }}
          />
        </div>
        <div className={styles.rightDropdown}>
          <CompositionDropdown
            dropdownItems={compareCompositionDropdownSource}
            selected={{ id: selectedCompareComp.identifier, label: selectedCompareComp.displayName }}
          />
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
