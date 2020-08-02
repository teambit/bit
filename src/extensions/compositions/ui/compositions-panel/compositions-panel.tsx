import React, { useCallback } from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist-temp.elements.icon';
import { Composition } from '../../composition';
import styles from './compositions-panel.module.scss';

export type CompositionsPanelProps = {
  compositions: Composition[];
  onSelect: (composition: Composition) => void;
  active?: Composition;
  url: string;
};

export function CompositionsPanel({ url, compositions, onSelect, active }: CompositionsPanelProps) {
  const handleSelect = useCallback(
    (selected: Composition) => {
      onSelect && onSelect(selected);
    },
    [onSelect]
  );

  return (
    <ul className={styles.composition}>
      {compositions.map((composition, key) => {
        // TODO - move to composition panel node
        return (
          <li key={key} className={classNames(styles.linkWrapper, composition === active && styles.active)}>
            <div className={styles.left}>
              <a className={styles.panelLink} onClick={() => handleSelect(composition)}>
                <span className={styles.box}>&#9632;</span>
                {composition.displayName}
              </a>
            </div>
            <div className={styles.right}>
              <a
                className={styles.panelLink}
                target="_blank"
                rel="noopener noreferrer"
                href={`${url}${composition.identifier}`}
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
