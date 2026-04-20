import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';
import { useSearchParams } from 'react-router-dom';
import React, { useCallback } from 'react';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { useNavigate, useLocation } from '@teambit/base-react.navigation.link';
import { useLiveControls } from '@teambit/compositions.ui.composition-live-controls';
import styles from './compositions-panel.module.scss';
import type { Composition } from '../../composition';

export type CompositionsPanelProps = {
  compositions: Composition[];
  onSelectComposition: (composition: Composition) => void;
  active?: Composition;
  url: string;
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
  const { setTimestamp } = useLiveControls();
  const shouldAddNameParam = useNameParam || (isScaling && includesEnvTemplate === false);

  const location = useLocation();
  const [searchParams] = useSearchParams();
  const versionFromQueryParams = searchParams.get('version');
  const navigate = useNavigate();

  const handleSelect = useCallback(
    (selected: Composition) => {
      onSelect && onSelect(selected);
      if (selected === active) return;
      setTimestamp(0);
    },
    [onSelect, active, setTimestamp]
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
    [location?.pathname, navigate, setTimestamp, versionFromQueryParams]
  );

  return (
    <div className={styles.container}>
      <ul {...rest} className={classNames(styles.compositionsList, className)}>
        {compositions.map((composition) => {
          const href = shouldAddNameParam
            ? `${url}&name=${composition.identifier}`
            : `${url}&${composition.identifier}`;
          return (
            <li
              key={composition.identifier}
              className={classNames(styles.compositionItem, composition === active && styles.active)}
            >
              <a className={styles.panelLink} onClick={() => handleSelect(composition)}>
                <span className={styles.compositionDot} />
                <span className={styles.name}>{composition.displayName}</span>
              </a>
              <div className={styles.itemActions}>
                <MenuWidgetIcon
                  className={styles.actionIcon}
                  icon="Code"
                  tooltipContent="View source"
                  onClick={onCompositionCodeClicked(composition)}
                />
                <Tooltip content="Open in new tab" placement="bottom">
                  <a
                    className={classNames(styles.actionIcon, styles.iconLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    href={href}
                  >
                    <Icon of="open-tab" />
                  </a>
                </Tooltip>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
