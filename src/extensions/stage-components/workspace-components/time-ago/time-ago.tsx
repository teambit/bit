import React from 'react';
import classNames from 'classnames';
import Time from '@bit/bit.bit-dev-utils.time-ago';
import styles from './time-ago.module.scss';

type TimeAgoProps = {
  date: string;
} & React.HTMLAttributes<HTMLSpanElement>;

export function TimeAgo({ date, className }: TimeAgoProps) {
  const formattedDate = Time(date);
  return <span className={classNames(styles.timeAgo, className)}>{formattedDate}</span>;
}
