import React from 'react';
import classNames from 'classnames';
import { H1 } from '@teambit/documenter.ui.heading';
import styles from './error-page.module.scss';

type ErrorPageProps = {
  /**
   * specifies the type of error that was encountered
   */
  code: number;
  /**
   * title to be shown above the error image
   */
  title?: string;
} & React.HTMLAttributes<HTMLDivElement>;

/**
 * A component that shows an error page according to the error code
 */
export function ErrorPage({ code, title, className, children, ...rest }: ErrorPageProps) {
  return (
    <div {...rest} className={classNames(styles.errorPage, className)}>
      <H1 className={styles.title}>{title}</H1>
      <img alt="error-image" className={styles.img} src={`https://static.bit.dev/harmony/${code}.svg`} />
      {children}
    </div>
  );
}
