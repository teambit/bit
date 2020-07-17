import React from 'react';
import classNames from 'classnames';
import styles from './compositions-overview.module.scss';

export type CompositionsOverviewProps = {
  compositions: {};
};
export function CompositionsOverview({ compositions }: CompositionsOverviewProps) {
  return (
    <div className={styles.background}>
      {compositions &&
        Object.keys(compositions).map((key) => {
          return (
            <div key={key} style={compositions[key].canvas} className={classNames(styles.singleCompositionBox)}>
              {compositions[key]()}
            </div>
          );
        })}
    </div>
  );
}
