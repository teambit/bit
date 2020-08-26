import { Icon } from '@teambit/evangelist.elements.icon';
import React from 'react';

import styles from './empty-compositions.module.scss';

export function EmptyCompositions() {
  return (
    <div className={styles.emptyCompositions}>
      <div className={styles.emptyCompositionsBox}>
        <div>There are no compositions for this component.</div>
        <a href="https://bit-new-docs.netlify.app/docs/getting-started/compositions#creating-compositions">
          Learn how to create compositions
          <Icon of="arrow_right" />
        </a>
      </div>
    </div>
  );
}
