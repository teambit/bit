/* eslint-disable @typescript-eslint/no-misused-promises */

import React, { ReactNode } from 'react';
import classnames from 'classnames';
import type { FallbackProps } from 'react-error-boundary';
import { IconButton } from '@teambit/design.ui.icon-button';
import { flexCenter } from '@teambit/base-ui.styles.flex-center';

import styles from './error-fallback.module.scss';

export type ErrorFallbackProps = FallbackProps & { className?: string; children?: ReactNode; cta?: string };
export function ErrorFallback({
  /* error, */
  resetErrorBoundary,
  className,
  children = 'Failed to render',
  cta = 'try again',
}: ErrorFallbackProps) {
  const handleClick = async () => {
    await new Promise((resolve) => setTimeout(resolve, 480));
    resetErrorBoundary();
  };

  return (
    <div className={classnames(styles.errorFallback, flexCenter, className)}>
      <div className={styles.icon} />
      <div className={styles.message}>{children}</div>
      <IconButton onClick={handleClick} className={styles.retryButton}>
        {cta}
      </IconButton>
    </div>
  );
}
