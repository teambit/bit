import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';
import { useSearchParams } from 'react-router-dom';
import React, { useCallback, useState } from 'react';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { useNavigate, useLocation } from '@teambit/base-react.navigation.link';
import { useLiveControls } from '@teambit/compositions.ui.composition-live-controls';
import styles from './compositions-panel.module.scss';
import type { Composition } from '../../composition';
import { LiveControls } from './live-control-panel';

export type CompositionsPanelProps = {
  /**
   * list of compositions
   */
  compositions: Composition[];
  /**
   * select composition to display
   */
  onSelectComposition: (composition: Composition) => void;
  /**
   * the currently active composition
   */
  active?: Composition;
  /**
   * the url to the base composition. doesntc contain the current composition params
   */
  url: string;
  /**
   * checks if a component is using the new preview api. if false, doesnt scale to support new preview
   */
  isScaling?: boolean;

  includesEnvTemplate?: boolean;

  useNameParam?: boolean;
} & React.HTMLAttributes<HTMLUListElement>;

export function CompositionsPanel({
  url,
  compositions,
  isScaling,
  onSelectComposition: onSelect,
  active,
  includesEnvTemplate,
  useNameParam,
  className,
  ...rest
}: CompositionsPanelProps) {
  const [openDrawerList, onToggleDrawer] = useState(['COMPOSITIONS', 'LIVE_CONTROLS']);
  const { hasLiveControls, ready, defs, values, onChange, setTimestamp } = useLiveControls();
  const handleDrawerToggle = (id: string) => {
    const isDrawerOpen = openDrawerList.includes(id);
    if (isDrawerOpen) {
      onToggleDrawer((list) => list.filter((drawer) => drawer !== id));
      return;
    }
    onToggleDrawer((list) => list.concat(id));
  };

  // setup from props
  const shouldAddNameParam = useNameParam || (isScaling && includesEnvTemplate === false);

  // current composition state
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const versionFromQueryParams = searchParams.get('version');
  const navigate = useNavigate();

  // composition navigation action
  const handleSelect = useCallback(
    (selected: Composition) => {
      onSelect && onSelect(selected);
      if (selected === active) return;
      setTimestamp(0);
    },
    [onSelect]
  );
  const onCompositionCodeClicked = useCallback(
    (composition: Composition) => (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setTimestamp(0);
      const queryParams = new URLSearchParams();
      if (versionFromQueryParams) {
        queryParams.set('version', versionFromQueryParams);
      }
      const basePath = location?.pathname.split('/~compositions')[0];
      navigate(`${basePath}/~code/${composition.filepath}?${queryParams.toString()}#search=${composition.identifier}`);
    },
    [location?.pathname, versionFromQueryParams]
  );

  return (
    <div className={classNames(styles.container)}>
      <DrawerUI
        isOpen={openDrawerList.includes('COMPOSITIONS')}
        onToggle={() => handleDrawerToggle('COMPOSITIONS')}
        name="COMPOSITIONS"
        className={classNames(styles.tab)}
      >
        <ul {...rest} className={classNames(className)}>
          {compositions.map((composition) => {
            const href = shouldAddNameParam
              ? `${url}&name=${composition.identifier}`
              : `${url}&${composition.identifier}`;
            return (
              <li
                key={composition.identifier}
                className={classNames(styles.linkWrapper, composition === active && styles.active)}
              >
                <a className={styles.panelLink} onClick={() => handleSelect(composition)}>
                  <span className={styles.name}>{composition.displayName}</span>
                </a>
                <div className={styles.right}>
                  <MenuWidgetIcon
                    className={styles.codeLink}
                    icon="Code"
                    tooltipContent="Code"
                    onClick={onCompositionCodeClicked(composition)}
                  />
                  <Tooltip content="Open in new tab" placement="bottom">
                    <a className={styles.iconLink} target="_blank" rel="noopener noreferrer" href={href}>
                      <Icon className={styles.icon} of="open-tab" />
                    </a>
                  </Tooltip>
                </div>
              </li>
            );
          })}
        </ul>
      </DrawerUI>
      {hasLiveControls ? (
        <DrawerUI
          name="LIVE CONTROLS"
          className={classNames(styles.tab, className)}
          isOpen={openDrawerList.includes('LIVE_CONTROLS')}
          onToggle={() => handleDrawerToggle('LIVE_CONTROLS')}
        >
          {ready ? (
            <LiveControls defs={defs} values={values} onChange={onChange} />
          ) : (
            <div className={styles.noLiveControls}>No live controls available for this composition</div>
          )}
        </DrawerUI>
      ) : null}
    </div>
  );
}
