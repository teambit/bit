import React from 'react';
import { CompositionCard } from '@teambit/compositions.ui.composition-card';
import { CompositionsModule } from '@teambit/compositions.model.composition-type';

import styles from './compositions-overview.module.scss';

export type CompositionsOverviewProps = {
  compositions?: CompositionsModule;
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
