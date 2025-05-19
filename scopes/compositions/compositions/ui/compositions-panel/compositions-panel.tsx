import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';
import { useSearchParams } from 'react-router-dom';
import React, { useCallback, useEffect, useState } from 'react';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { useNavigate, useLocation } from '@teambit/base-react.navigation.link';
import { Composition } from '../../composition';
import styles from './compositions-panel.module.scss';
import { type LiveControlReadyEventData, type LiveControlUpdateEventData } from './live-control.type';
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
  // setup drawer state
  const [openDrawerList, onToggleDrawer] = useState(['COMPOSITIONS', 'LIVE_CONTROLS']);
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

  // live control state
  const [controlsTimestamp, setControlsTimestamp] = useState(0);
  const [controlsDefs, setControlsDefs] = useState<any>(null);
  const [consolesValues, setConsolesValues] = useState<any>({});
  const [mounter, setMounter] = useState<Window>();

  // composition navigation action
  const handleSelect = useCallback(
    (selected: Composition) => {
      onSelect && onSelect(selected);
      setControlsTimestamp(0);
    },
    [onSelect]
  );
  const onCompositionCodeClicked = useCallback(
    (composition: Composition) => (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setControlsTimestamp(0);
      const queryParams = new URLSearchParams();
      if (versionFromQueryParams) {
        queryParams.set('version', versionFromQueryParams);
      }
      const basePath = location?.pathname.split('/~compositions')[0];
      navigate(`${basePath}/~code/${composition.filepath}?${queryParams.toString()}#search=${composition.identifier}`);
    },
    [location?.pathname, versionFromQueryParams]
  );

  // listen to the mounter for live control updates
  useEffect(() => {
    function onLiveControlsSetup(e: MessageEvent<LiveControlReadyEventData>) {
      if (!e.data || e.data.type !== 'composition-live-controls:ready') return () => {};
      const { controls, values, timestamp } = JSON.parse(JSON.stringify(e.data.payload));
      // eslint-disable-next-line no-console
      console.log('onLiveControlsSetup', controls, values, timestamp);
      const iframeWindow = e.source;
      setMounter(iframeWindow as Window);
      setControlsDefs(controls);
      setConsolesValues(values);
      setControlsTimestamp(timestamp);
    }
    // LATER
    // function onLiveControlsDestroy(e: MessageEvent<LiveControlReadyEventData>) {}
    window.addEventListener('message', onLiveControlsSetup);
    return () => {
      window.removeEventListener('message', onLiveControlsSetup);
    };
  }, []);

  // sync live control updates back to the mounter
  const onLiveControlsUpdate = useCallback(
    (key: string, value: any) => {
      if (mounter) {
        const data: LiveControlUpdateEventData = {
          type: 'composition-live-controls:update',
          payload: {
            key,
            value: JSON.parse(JSON.stringify(value)),
            timestamp: controlsTimestamp,
          },
        };
        mounter.postMessage(data);
      }
      setConsolesValues((prev: any) => ({ ...prev, [key]: value }));
    },
    [mounter, consolesValues, controlsTimestamp]
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
                  <span className={styles.box}></span>
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
                    <a className={styles.panelLink} target="_blank" rel="noopener noreferrer" href={href}>
                      <Icon className={styles.icon} of="open-tab" />
                    </a>
                  </Tooltip>
                </div>
              </li>
            );
          })}
        </ul>
      </DrawerUI>
      <DrawerUI
        isOpen={openDrawerList.includes('LIVE_CONTROLS')}
        onToggle={() => handleDrawerToggle('LIVE_CONTROLS')}
        className={classNames(styles.tab)}
        name="LIVE CONTROLS"
      >
        {controlsTimestamp ? (
          <LiveControls defs={controlsDefs} values={consolesValues} onChange={onLiveControlsUpdate} />
        ) : (
          <div className={styles.noLiveControls}>No live controls available for this composition</div>
        )}
      </DrawerUI>
    </div>
  );
}
