import React from 'react';

import styles from './compositions-overview.module.scss';
import { CompositionCard } from './composition-card';

export type CompositionsOverviewProps = {
  compositions?: Record<string, CompositionType>;
};

export function CompositionsOverview({ compositions }: CompositionsOverviewProps) {
  return (
    <div className={styles.background}>
      {compositions &&
        Object.entries(compositions).map(([key, composition]) => (
          <CompositionCard key={key} Composition={composition} name={key} />
        ))}
    </div>
  );
}
