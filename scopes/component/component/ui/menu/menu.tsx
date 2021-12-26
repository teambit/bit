import { MainDropdown, MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import { VersionDropdown } from '@teambit/component.ui.version-dropdown';
import { FullLoader } from '@teambit/legacy/dist/to-eject/full-loader';
import type { ConsumeMethod } from '@teambit/ui-foundation.ui.use-box.menu';
import { flatten, groupBy } from 'lodash';
import classnames from 'classnames';
import React, { useMemo } from 'react';
import { UseBoxDropdown } from '@teambit/ui-foundation.ui.use-box.dropdown';
import { Menu as ConsumeMethodsMenu } from '@teambit/ui-foundation.ui.use-box.menu';
import type { ComponentModel } from '../component-model';
import { useComponent } from '../use-component';
import { MenuNav } from './menu-nav';
import styles from './menu.module.scss';
import { OrderedNavigationSlot, ConsumeMethodSlot } from './nav-plugin';

export type MenuProps = {
  className?: string;
  /**
   * slot for top bar menu nav items
   */
  navigationSlot: OrderedNavigationSlot;
  /**
   * right side menu item slot
   */
  widgetSlot: OrderedNavigationSlot;
  host: string;
  /**
   * main dropdown item slot
   */
  menuItemSlot: MenuItemSlot;

  consumeMethodSlot: ConsumeMethodSlot;
};

/**
 * top bar menu.
 */
export function Menu({ navigationSlot, widgetSlot, className, host, menuItemSlot, consumeMethodSlot }: MenuProps) {
  const { component } = useComponent(host);
  const mainMenuItems = useMemo(() => groupBy(flatten(menuItemSlot.values()), 'category'), [menuItemSlot]);
  if (!component) return <FullLoader />;
  return (
    <div className={classnames(styles.topBar, className)}>
      <div className={styles.leftSide}>
        <MenuNav navigationSlot={navigationSlot} />
      </div>
      <div className={styles.rightSide}>
        <div className={styles.widgets}>
          <MenuNav navigationSlot={widgetSlot} />
        </div>
        <VersionRelatedDropdowns component={component} consumeMethods={consumeMethodSlot} />
        <MainDropdown menuItems={mainMenuItems} />
      </div>
    </div>
  );
}

function VersionRelatedDropdowns({
  component,
  consumeMethods,
}: {
  component: ComponentModel;
  consumeMethods: ConsumeMethodSlot;
}) {
  const versionList =
    useMemo(
      () =>
        component.tags
          ?.toArray()
          .map((tag) => tag?.version?.version)
          .filter((x) => x !== undefined)
          .reverse(),
      [component.tags]
    ) || [];

  const methods = useConsumeMethods(consumeMethods, component);
  return (
    <>
      {versionList.length > 0 && (
        <UseBoxDropdown
          position="bottom-end"
          className={styles.useBox}
          Menu={<ConsumeMethodsMenu methods={methods} componentName={component.id.name} />}
        />
      )}
      <VersionDropdown versions={versionList} currentVersion={component.version} />
    </>
  );
}

function useConsumeMethods(consumeMethods: ConsumeMethodSlot, componentModel: ComponentModel): ConsumeMethod[] {
  return useMemo(
    () =>
      flatten(consumeMethods.values())
        .map((method) => {
          return method?.(componentModel);
        })
        .filter((x) => !!x && x.Component && x.Title) as ConsumeMethod[],
    [consumeMethods, componentModel]
  );
}
