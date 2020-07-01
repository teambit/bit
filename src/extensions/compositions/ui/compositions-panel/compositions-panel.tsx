import React from 'react';
import { Composition } from '../../composition';
import styles from './compositions-panel.module.scss';

export type CompositionsPanelProps = {
  compositions: Composition[];
  onCompositionSelect: (composition: Composition) => void;
};

export function CompositionsPanel({ compositions, onCompositionSelect }: CompositionsPanelProps) {
  return (
    <ul className={styles.composition}>
      {compositions.map((composition, key) => {
        return (
          <li key={key}>
            <a className={styles.panelLink} onClick={() => onCompositionSelect && onCompositionSelect(composition)}>
              {composition.displayName}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
