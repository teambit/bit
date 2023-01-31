import React, { useCallback, HTMLAttributes, useMemo } from 'react';
import { CollapsibleMenuNav, NavPlugin } from '@teambit/component';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { ChangeType } from '@teambit/component.ui.component-compare.models.component-compare-change-type';
import { WordSkeleton } from '@teambit/base-ui.loaders.skeleton';
import classnames from 'classnames';

import styles from './component-compare-nav.module.scss';

export type CompareMenuNavProps = { widgetPlugins: [string, NavPlugin][]; navPlugins: [string, NavPlugin][] };

export function CompareMenuNav({ widgetPlugins, navPlugins }: CompareMenuNavProps) {
  const componentCompare = useComponentCompare();
  const changes = componentCompare?.changes;

  const mapToCompareNav: (navItems: [string, NavPlugin][]) => [string, NavPlugin][] = useCallback(
    (navItems) =>
      navItems.map(([id, navItem], index) => {
        const changeTypeCss = deriveChangeTypeCssForNav(navItem, changes);
        const loading = changes === undefined;
        const key = `${id}-tab-${changeTypeCss}`;

        return [
          id || `tab-${index}`,
          {
            ...navItem,
            props: {
              ...(navItem.props || {}),
              key,
              displayName: (!loading && navItem.props.displayName) || undefined,
              activeClassName: (!loading && styles.activeNav) || styles.loadingNav,
              className: styles.navItem,
              children: (
                <CompareMenuTab key={key} loading={loading} changeTypeCss={changeTypeCss} changes={changes}>
                  {navItem.props?.children}
                </CompareMenuTab>
              ),
            },
          },
        ];
      }),

    [navPlugins.length, changes, changes?.length, widgetPlugins.length]
  );

  return (
    <CollapsibleMenuNav
      className={styles.navContainer}
      navPlugins={mapToCompareNav(navPlugins)}
      widgetPlugins={mapToCompareNav(widgetPlugins)}
    />
  );
}
function deriveChangeTypeCssForNav(tab: NavPlugin, changed: ChangeType[] | null | undefined): string | null {
  if (!changed || !tab.changeType) return null;
  const hasChanged = changed.some((change) => tab.changeType === change);
  return hasChanged ? styles.hasChanged : null;
}

function CompareMenuTab({
  children,
  changes,
  changeTypeCss,
  loading,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  changeTypeCss?: string | null;
  loading?: boolean;
  changes?: ChangeType[] | null;
}) {
  const hasChanged = useMemo(
    () => changes?.some((change) => change !== ChangeType.NONE && change !== ChangeType.NEW),
    [changeTypeCss]
  );

  if (loading) return <TabLoader />;

  return (
    <div {...rest} className={classnames(styles.compareMenuTab, className)}>
      {changeTypeCss && hasChanged && <div className={classnames(styles.indicator, changeTypeCss)}></div>}
      <div className={classnames(styles.menuTab)}>{children}</div>
    </div>
  );
}

function TabLoader() {
  return <WordSkeleton className={styles.tabLoader} length={5} />;
}
