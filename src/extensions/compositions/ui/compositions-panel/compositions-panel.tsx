import React, { useCallback } from 'react';
import classNames from 'classnames';
import { Composition } from '../../composition';
import styles from './compositions-panel.module.scss';

export type CompositionsPanelProps = {
  compositions: Composition[];
  onSelect: (composition: Composition) => void;
  active?: Composition;
};

export function CompositionsPanel({ compositions, onSelect, active }: CompositionsPanelProps) {
  const handleSelect = useCallback(
    (selected: Composition) => {
      onSelect && onSelect(selected);
    },
    [onSelect]
  );

  return (
    <ul className={styles.composition}>
      {compositions.map((composition, key) => {
        return (
          <li key={key} className={classNames(styles.linkWrapper, composition === active && styles.active)}>
            <span className={styles.box}>&#9632;</span>
            <a className={styles.panelLink} onClick={() => handleSelect(composition)}>
              {composition.displayName}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
