import React, { HTMLAttributes, useState, useCallback, useMemo } from 'react';
import { ComponentID } from '@teambit/component-id';
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
import {
  LaneCompareDrawer,
  LaneCompareDrawerName,
  LaneCompareDrawerProps,
} from '@teambit/lanes.ui.compare.lane-compare-drawer';
import { UseComponentType } from '@teambit/component';

import styles from './lane-compare.module.scss';

export type LaneCompareProps = {
  base: LaneModel;
  compare: LaneModel;
  host: string;
  tabs?: MaybeLazyLoaded<TabItem[]>;
  customUseComponent?: UseComponentType;
  Drawer?: React.ComponentType<LaneCompareDrawerProps>;
} & HTMLAttributes<HTMLDivElement>;

export function LaneCompare({
  host,
  compare,
  base,
  tabs,
  customUseComponent,
  Drawer = LaneCompareDrawer,
  ...rest
}: LaneCompareProps) {
  const baseMap = useMemo(
    () => new Map<string, ComponentID>(base.components.map((c) => [c.toStringWithoutVersion(), c])),
    [base.components]
  );
  const compareMap = useMemo(
    () => new Map<string, ComponentID>(compare.components.map((c) => [c.toStringWithoutVersion(), c])),
    [compare.components]
  );

  const newComponents = useMemo(
    () =>
      compare.components
        .filter((componentId) => !baseMap.has(componentId.toStringWithoutVersion()))
        .map((c) => [undefined, compareMap.get(c.toStringWithoutVersion()) as ComponentID]),
    [base, compare]
  );
  const commonComponents = useMemo(
    () =>
      compare.components
        .filter((componentId) => {
          const compIdStr = componentId.toStringWithoutVersion();
          const baseCompId = baseMap.get(compIdStr);
          return baseCompId && !baseCompId.isEqual(componentId);
        })
        .map((cc) => [
          baseMap.get(cc.toStringWithoutVersion()) as ComponentID,
          compareMap.get(cc.toStringWithoutVersion()) as ComponentID,
        ]),
    [base.components, compare.components]
  );

  const allComponents = useMemo(() => [...commonComponents, ...newComponents], [base.components, compare.components]);

  const defaultState = useCallback(() => {
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
        element: null,
      },
    };
    return value;
  }, []);

  const [state, setState] = useState<LaneCompareState>(
    new Map(
      allComponents.map(([_base, _compare]) => {
        const key = computeStateKey(_base, _compare);
        const value = defaultState();
        return [key, value];
      })
    )
  );

  const [closeDrawerList, onToggleDrawer] = useState<string[]>([]);

  const handleDrawerToggle = (id: string) => {
    const isDrawerOpen = !closeDrawerList.includes(id);
    if (isDrawerOpen) {
      onToggleDrawer((list) => list.concat(id));
      return;
    }
    onToggleDrawer((list) => list.filter((drawer) => drawer !== id));
  };

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
          existingState = defaultState();
        }
        return new Map(value);
      });

    const _hooks: ComponentCompareHooks = {
      code: {
        onClick: onClicked('code'),
      },
      aspects: {
        onClick: onClicked('aspects'),
      },
      tabs: {
        onClick: onClicked('tabs'),
      },
    };

    return _hooks;
  }, []);

  const ComponentCompares = useMemo(() => {
    return allComponents.map(([baseId, compareId]) => {
      const key = computeStateKey(baseId, compareId);
      const open = closeDrawerList.includes(key);

      return (
        <Drawer
          key={`${key}-drawer`}
          drawerProps={{
            isOpen: open,
            onToggle: () => handleDrawerToggle(key),
            name: <LaneCompareDrawerName compareId={compareId} baseId={baseId} open={open} />,
            className: styles.componentCompareDrawer,
            contentClass: styles.componentCompareDrawerContent,
          }}
          compareProps={{
            host,
            tabs,
            baseId,
            compareId,
            className: styles.componentCompareContainer,
            state: state.get(key),
            hooks: hooks(baseId, compareId),
            customUseComponent,
          }}
        />
      );
    });
  }, [base.id.toString(), compare.id.toString(), closeDrawerList.length]);

  return (
    <div {...rest} className={styles.laneCompareContainer}>
      {...ComponentCompares}
    </div>
  );
}
