import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';
import React, { useCallback } from 'react';

import { Composition } from '../../composition';
import styles from './compositions-panel.module.scss';

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
} & React.HTMLAttributes<HTMLUListElement>;

export function CompositionsPanel({
  url,
  compositions,
  isScaling,
  onSelectComposition: onSelect,
  active,
  className,
  ...rest
}: CompositionsPanelProps) {
  const handleSelect = useCallback(
    (selected: Composition) => {
      onSelect && onSelect(selected);
    },
    [onSelect]
  );

  return (
    <ul {...rest} className={classNames(className)}>
      {compositions.map((composition) => {

        const href = isScaling ? `${url}&name=${composition.identifier}` : `${url}&${composition.identifier}`;

        // TODO - move to composition panel node
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
              <a
                className={styles.panelLink}
                target="_blank"
                rel="noopener noreferrer"
                href={href}
              >
                <Icon className={styles.icon} of="open-tab" />
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
