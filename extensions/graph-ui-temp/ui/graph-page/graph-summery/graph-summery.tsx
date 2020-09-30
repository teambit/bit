import React, { HTMLAttributes } from 'react';
import classnames from 'classnames';
import { mutedText } from '@teambit/base-ui.text.muted-text';
import { themedText } from '@teambit/base-ui.text.themed-text';
import { colorPalette } from '@teambit/base-ui.theme.color-palette';
import styles from './graph-summery.module.scss';

export type GraphStats = { runtime: number; dev: number; peer: number; total: number; depth: number };

export interface GraphSummeryProps extends HTMLAttributes<HTMLDivElement> {
  stats: GraphStats;
}

export function GraphSummery({ stats, ...rest }: GraphSummeryProps) {
  return (
    <div {...rest}>
      <table className={styles.stats}>
        <tr className={mutedText}>
          <th>Runtime</th>
          <th>Dev</th>
          <th>Peer</th>
          <th>Total</th>
          <th>Depth</th>
        </tr>

        <tr className={classnames(themedText, colorPalette.emphasized)}>
          <td>{stats.runtime}</td>
          <td>{stats.dev}</td>
          <td>{stats.peer}</td>
          <td>{stats.total}</td>
          <td>{stats.depth}</td>
        </tr>
      </table>
    </div>
  );
}
