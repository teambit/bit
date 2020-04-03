import React from 'react';
import classNames from 'classnames';
import styles from './card.module.scss';
import elevations from './elevations.module.scss';

export type CardProps = {
  /**
   * Controls the shadow cast by the card, to generate a "stacking" effects.
   * For example, a modal floating over elements may have a 'high' elevation
   */
  elevation: 'none' | 'low' | 'medium' | 'high';
} & React.HTMLAttributes<HTMLDivElement>;

/**
 * A wrapper resembling a physical card, grouping elements and improve readability.
 */
export function Card({ className, elevation, ...rest }: CardProps) {
  return <div className={classNames(styles.card, elevations[elevation], className)} {...rest} />;
}

Card.defaultProps = {
  elevation: 'low'
};
