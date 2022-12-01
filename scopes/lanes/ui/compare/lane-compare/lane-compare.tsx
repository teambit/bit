import React, { HTMLAttributes, useState, useCallback, useMemo } from 'react';
import { ComponentID } from '@teambit/component-id';
import { ComponentCompare } from '@teambit/component.ui.component-compare.component-compare';
import {
  ComponentCompareState,
  ComponentCompareStateKey,
} from '@teambit/component.ui.component-compare.models.component-compare-state';
import { extractLazyLoadedData, MaybeLazyLoaded } from '@teambit/component.ui.component-compare.utils.lazy-loading';
import { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { ComponentCompareHooks } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
import { sortTabs } from '@teambit/component.ui.component-compare.utils.sort-tabs';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { LaneCompareState, computeStateKey } from '@teambit/lanes.ui.compare.lane-compare-state';
import { useUpdatedUrlFromQuery } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { UseComponentType } from '@teambit/component';

import styles from './lane-compare.module.scss';

export type LaneCompareProps = {
  base: LaneModel;
  compare: LaneModel;
  host: string;
  tabs?: MaybeLazyLoaded<TabItem[]>;
  customUseComponent?: UseComponentType;
} & HTMLAttributes<HTMLDivElement>;

export function LaneCompare({ host, compare, base, tabs, customUseComponent, ...rest }: LaneCompareProps) {
  const baseMap = useMemo(
    () => new Map<string, ComponentID>(base.components.map((c) => [c.toStringWithoutVersion(), c])),
    [base.components]
  );
  const compareMap = useMemo(
    () => new Map<string, ComponentID>(compare.components.map((c) => [c.toStringWithoutVersion(), c])),
    [compare.components]
  );

  const uniqueCompare = useMemo(
    () =>
      compare.components
        .filter((componentId) => !baseMap.has(componentId.toStringWithoutVersion()))
        .map((c) => [undefined, compareMap.get(c.toStringWithoutVersion()) as ComponentID]),
    [base, compare]
  );
  const commonComponents = useMemo(
    () =>
      compare.components
        .filter((componentId) => baseMap.has(componentId.toStringWithoutVersion()))
        .map((cc) => [
          baseMap.get(cc.toStringWithoutVersion()) as ComponentID,
          compareMap.get(cc.toStringWithoutVersion()) as ComponentID,
        ]),
    [base.components, compare.components]
  );

  const allComponents = useMemo(() => [...commonComponents, ...uniqueCompare], [base.components, compare.components]);

  const defaultState = useCallback(([_base, _compare]: [ComponentID | undefined, ComponentID | undefined]) => {
    const _tabs = extractLazyLoadedData(tabs)?.sort(sortTabs);

    const value: ComponentCompareState = {
      tabs: {
        controlled: true,
        id: _tabs && _tabs[0].id,
        element: _tabs && _tabs[0].element,
      },
      code: {
        controlled: true,
      },
      aspects: {
        controlled: true,
      },
      versionPicker: {
        element: (
          <div className={styles.versionPicker}>
            {`${(_base && 'Comparing Component') || 'Component'} ${_compare?.toStringWithoutVersion()}`}
            <div>{`${_compare?.version} ${(_base && ` with ${_base.version}`) || ''}`}</div>
          </div>
        ),
      },
    };
    return value;
  }, []);

  const [state, setState] = useState<LaneCompareState>(
    new Map(
      allComponents.map(([_base, _compare]) => {
        const key = computeStateKey(_base, _compare);
        const value = defaultState([_base, _compare]);
        return [key, value];
      })
    )
  );

  const hooks = useCallback((_base?: ComponentID, _compare?: ComponentID) => {
    const key = computeStateKey(_base, _compare);
    const _tabs = extractLazyLoadedData(tabs);

    const onClicked = (prop: ComponentCompareStateKey) => (id) =>
      setState((value) => {
        let existingState = value.get(key);
        const propState = existingState?.[prop];
        if (propState) {
          propState.id = id;
          propState.element = _tabs?.find((_tab) => _tab.id === id)?.element;
        } else {
          existingState = defaultState([_base, _compare]);
        }
        return new Map(value);
      });

    const _hooks: ComponentCompareHooks = {
      code: {
        onClick: onClicked('code'),
        useUpdatedUrlFromQuery: () => useUpdatedUrlFromQuery({}),
      },
      aspects: {
        onClick: onClicked('aspects'),
        useUpdatedUrlFromQuery: () => useUpdatedUrlFromQuery({}),
      },
      tabs: {
        onClick: onClicked('tabs'),
      },
    };

    return _hooks;
  }, []);

  const ComponentCompares = useMemo(() => {
    return allComponents.map(([baseId, compareId]) => {
      return (
        <ComponentCompare
          className={styles.componentCompareContainer}
          key={`lane-compare-component-compare-${computeStateKey(baseId, compareId)}`}
          host={host}
          tabs={tabs}
          state={state.get(computeStateKey(baseId, compareId))}
          hooks={hooks(baseId, compareId)}
          baseId={baseId}
          compareId={compareId}
          customUseComponent={customUseComponent}
        />
      );
    });
  }, [base.id.toString(), compare.id.toString()]);

  return (
    <div {...rest} className={styles.laneCompareContainer}>
      {...ComponentCompares}
    </div>
  );
}
