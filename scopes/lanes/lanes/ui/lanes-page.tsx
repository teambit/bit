import React, { HTMLAttributes } from 'react';
import { EmptyStateSlot } from '../lanes.ui.runtime';

import styles from './lanes-page.module.scss';

type LanesPageProps = {
  emptyState: EmptyStateSlot;
} & HTMLAttributes<HTMLDivElement>;

export function LanesPage({ className, emptyState }: LanesPageProps) {
  return (
    <div>
      <h1>Hi, this is the Lanes UI</h1>
    </div>
  );
}
