import { Icon } from '@teambit/evangelist.elements.icon';
import React from 'react';

import styles from './empty-compositions.module.scss';

export function EmptyCompositions() {
  return (
    <div className={styles.emptyCompositions}>
      <div className={styles.emptyCompositionsBox}>
        <div>There are no compositions for this component.</div>
        <a
          href="https://bit-new-docs.netlify.app/docs/compositions/develop-in-isolation"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn how to create compositions
          <Icon of="arrow_right" />
        </a>
      </div>
    </div>
  );
}
