import React from 'react';
import classNames from 'classnames';
import styles from './separator.module.scss';

// type SeparatorProps = {} & React.HTMLAttributes<HTMLDivElement>;
// TODO : fix this type (scope is not working with SeparatorProps)
export function Separator({ className, ...rest }: any) {
  return <hr className={classNames(styles.separator, className)} {...rest} />;
}
