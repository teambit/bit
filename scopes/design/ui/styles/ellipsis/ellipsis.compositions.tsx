import React from 'react';
import { Ellipsis } from './index';
import styles from './ellipsis.compositions.module.scss';

const longName = "This is a really long name so you'll see the ellipsis";
const shortName = 'Short';

export const LongString = () => {
  return <Ellipsis className={styles['input-width']}>{longName}</Ellipsis>;
};

export const ShortString = () => {
  return <Ellipsis className={styles['input-width']}>{shortName}</Ellipsis>;
};
