import { ComponentContext, TopBarNav, useComponent } from '@teambit/component';
import { ComponentCompareNav, ComponentCompareNavSlot } from '@teambit/component-compare';
import { RouteSlot, SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import flatten from 'lodash.flatten';
import classnames from 'classnames';
import { useLocation } from '@teambit/base-react.navigation.link';
import { ResponsiveNavbar } from '@teambit/design.navigation.responsive-navbar';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import React, { HTMLAttributes, useContext, useMemo } from 'react';
import { ComponentCompareContext, ComponentCompareModel } from './component-compare-context';
import { ComponentCompareVersionPicker } from './version-picker/component-compare-version-picker';
import { useCompareQueryParam } from './use-component-compare-url';
import { ComponentCompareBlankState } from './blank-state';

import styles from './component-compare.module.scss';

export type ComponentCompareProps = {
  navSlot: ComponentCompareNavSlot;
  routeSlot: RouteSlot;
  host: string;
} & HTMLAttributes<HTMLDivElement>;

const findPrevVersionFromCurrent = (compareVersion) => (_, index: number, logs: LegacyComponentLog[]) => {
  if (index === 0) return false;
  if (logs.length === 1) return true;

  const prevIndex = index - 1;

  return logs[prevIndex].tag === compareVersion || logs[prevIndex].hash === compareVersion;
};

const groupByVersion = (accum: Map<string, LegacyComponentLog>, current: LegacyComponentLog) => {
  if (!accum.has(current.tag || current.hash)) {
    accum.set(current.tag || current.hash, current);
  }
  return accum;
};

export function ComponentCompare({ navSlot, host, routeSlot }: ComponentCompareProps) {
  const baseVersion = useCompareQueryParam('baseVersion');
  const component = useContext(ComponentContext);
  const location = useLocation();

  const isWorkspace = host === 'teambit.workspace/workspace';
  const allVersionInfo = component.logs?.slice() || [];
  const isNew = allVersionInfo.length === 0;
  const compareVersion =
    isWorkspace && !isNew && !location?.search.includes('version') ? 'workspace' : component.id.version;
  const compareIsLocalChanges = compareVersion === 'workspace';

  const lastVersionInfo = useMemo(() => {
    const prevVersionInfo = allVersionInfo.find(findPrevVersionFromCurrent(compareVersion));
    return prevVersionInfo;
  }, [component.logs]);

  const baseId =
    (baseVersion && component.id.changeVersion(baseVersion)) ||
    (lastVersionInfo && component.id.changeVersion(lastVersionInfo.tag || lastVersionInfo.hash)) ||
    component.id;

  const compare = component;

  const { component: base, loading } = useComponent(host, baseId.toString());

  const nothingToCompare = !loading && !compareIsLocalChanges && (component.logs?.length || []) < 2;
  const showSubMenus = !loading && !nothingToCompare;

  const logsByVersion = useMemo(
    () => allVersionInfo.reduce(groupByVersion, new Map<string, LegacyComponentLog>()),
    [compare.id, baseId]
  );

  const componentCompareModel: ComponentCompareModel = {
    compare: {
      model: compare,
      hasLocalChanges: compareIsLocalChanges,
    },
    base: base && {
      model: base,
    },
    loading,
    logsByVersion,
  };

  return (
    <ComponentCompareContext.Provider value={componentCompareModel}>
      <div className={styles.componentCompareContainer}>
        {loading && (
          <div className={styles.loader}>
            <RoundLoader />
          </div>
        )}
        {showSubMenus && (
          <>
            <div className={styles.top}>
              <ComponentCompareVersionPicker />
            </div>
            <div className={styles.bottom}>
              <CompareMenuNav navSlot={navSlot} />
              <SlotRouter slot={routeSlot} />
            </div>
          </>
        )}
        {nothingToCompare && <ComponentCompareBlankState />}
      </div>
    </ComponentCompareContext.Provider>
  );
}

function CompareMenuNav({ navSlot }: { navSlot: ComponentCompareNavSlot }) {
  const plugins = flatten(
    navSlot.toArray().map(([id, values]) => {
      const flattenedValues = flatten(values).map((value) => ({ ...value, id }));
      return flattenedValues;
    })
  ).sort(sortFn);

  const links = plugins.map((menuItem, index) => {
    return {
      component: function TopBarNavItem({ isInMenu }: { isInMenu: boolean }) {
        return (
          <TopBarNav
            key={`${menuItem.id}-${index}`}
            {...menuItem.props}
            className={classnames(styles.compareMenuLink, isInMenu && styles.collapsedMenuLink)}
          />
        );
      },
    };
  });

  return (
    <div className={styles.navContainer}>
      <ResponsiveNavbar
        className={styles.navigation}
        navClassName={styles.tab}
        style={{ width: '100%', height: '100%' }}
        priority="none"
        tabs={links}
      />
    </div>
  );
}

function sortFn({ order: first }: ComponentCompareNav, { order: second }: ComponentCompareNav) {
  return (first ?? 0) - (second ?? 0);
}
