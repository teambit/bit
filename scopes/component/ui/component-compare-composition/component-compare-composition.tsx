import { useComponentCompareContext, useComponentCompareParams } from "@teambit/component.ui.component-compare";
import { Composition, CompositionContent } from "@teambit/compositions";
import { CompositionContextProvider } from "@teambit/compositions.ui.hooks.use-composition";
import classNames from "classnames";
import queryString from 'query-string';
import React, { useMemo, useState } from "react";
import styles from "./component-compare-composition.module.scss";
import { CompositionDropdown } from "./composition-dropdown";

export function ComponentCompareComposition() {
    const component = useComponentCompareContext();

    if (component === undefined) {
        return <></>;
    }

    const { loading, base, compare } = component;
    const baseCompositions = base.compositions;
    const compareCompositions = compare.compositions;
    const baseCompositionDropdownSource = baseCompositions.map(c => ({ label: c.displayName, value: c.identifier }));
    const compareCompositionDropdownSource = compareCompositions.map(c => ({ label: c.displayName, value: c.identifier }));

    const { compositionBase, compositionCompare } = useComponentCompareParams();
    // compositionBase -> filename

    const [selectedBaseComp, setSelectedBaseComp] = useState<Composition>(baseCompositions[0]);
    const [selectedCompareComp, setSelectedCompareComp] = useState<Composition>(compareCompositions[0]);

    const [baseCompositionParams, setBaseCompositionParams] = useState<Record<string, any>>({});
    const baseCompQueryParams = useMemo(() => queryString.stringify(baseCompositionParams), [baseCompositionParams]);

    const [compareCompositionParams, setCompareCompositionParams] = useState<Record<string, any>>({});
    const compareCompQueryParams = useMemo(() => queryString.stringify(compareCompositionParams), [compareCompositionParams]);

    // if (loading) {
    //     return <div>Loading...</div>
    // }

    return (
        <>
            <div className={styles.dropdownContainer}>
                <div className={styles.leftDropdown}>
                    <CompositionDropdown dropdownItems={baseCompositionDropdownSource} side="base" />
                </div>
                <div className={styles.rightDropdown}>
                    <CompositionDropdown dropdownItems={compareCompositionDropdownSource} side="compare" />
                </div>
            </div>
            <div className={styles.mainContainer}>
                <div className={styles.subContainerLeft}>
                    <div className={styles.subView}>
                        <CompositionContextProvider queryParams={baseCompositionParams} setQueryParams={setBaseCompositionParams}>
                            <CompositionContent
                                emptyState={undefined} // todo: has to come from emptyStateSlot
                                component={base}
                                selected={selectedBaseComp}
                                queryParams={baseCompQueryParams}
                            />
                        </CompositionContextProvider>
                    </div>
                </div>
                <div className={styles.subContainerRight}>
                    <div className={styles.subView}>
                        <CompositionContextProvider queryParams={compareCompositionParams} setQueryParams={setCompareCompositionParams}>
                            <CompositionContent
                                emptyState={undefined} // todo: has to come from emptyStateSlot
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
