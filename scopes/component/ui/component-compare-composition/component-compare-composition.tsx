import { useComponentCompareContext } from "@teambit/component.ui.component-compare";
import { Composition, CompositionContent } from "@teambit/compositions";
import { CompositionContextProvider } from "@teambit/compositions.ui.hooks.use-composition";
import classNames from "classnames";
import queryString from 'query-string';
import React, { useMemo, useState } from "react";
import styles from "./component-compare-composition.module.scss";

export function ComponentCompareComposition() {
    const component = useComponentCompareContext();

    if (component === undefined) {
        return <></>;
    }

    const { loading, base, compare } = component;
    const baseCompositions = base.compositions;
    const compareCompositions = compare.compositions;

    const [selectedBaseComp, setSelectedBaseComp] = useState<Composition>(baseCompositions[0]);
    const [selectedCompareComp, setSelectedCompareComp] = useState<Composition>(compareCompositions[1]);

    const [baseCompositionParams, setBaseCompositionParams] = useState<Record<string, any>>({});
    const baseCompQueryParams = useMemo(() => queryString.stringify(baseCompositionParams), [baseCompositionParams]);

    const [compareCompositionParams, setCompareCompositionParams] = useState<Record<string, any>>({});
    const compareCompQueryParams = useMemo(() => queryString.stringify(compareCompositionParams), [compareCompositionParams]);

    // if (loading) {
    //     return <div>Loading...</div>
    // }

    // todo: fix height of containers
    return (
        <div className={styles.mainContainer}>
            <div className={styles.subContainer}>
                <div className={classNames([styles.subView, styles.leftView])}>
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
            <div className={styles.subContainer}>
                <div className={classNames([styles.subView, styles.rightView])}>
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
    );
}