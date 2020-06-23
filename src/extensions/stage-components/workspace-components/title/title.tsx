import React from 'react';
import classNames from 'classnames';
import { H1 } from '@bit/bit.evangelist.elements.heading';
import styles from './title.module.scss';

type TitleProps = {} & React.HTMLAttributes<HTMLDivElement>;

export function Title({ className, children, ...rest }: TitleProps) {
  return (
    <H1 className={classNames(styles.title, className)} {...rest}>
      {children}
    </H1>
  );
}
