import React, { HTMLAttributes } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import classNames from 'classnames';
import { Composer } from '@teambit/base-ui.utils.composer';
import { ErrorFallback } from '@teambit/react.ui.error-fallback';

import type { RenderingContext } from '@teambit/preview';
import { ReactAspect } from '@teambit/react';
import styles from './apply-providers.modules.scss';


export type ApplyProvidersProps = {
  renderingContext: RenderingContext;
  children: React.ReactNode;
} & HTMLAttributes<HTMLDivElement>;

/**
 * base template for react component documentation
 */
export function ApplyProviders({ renderingContext, children, ...rest }: ApplyProvidersProps) {

  const { providers = [] } = renderingContext.get(ReactAspect.id) || {};

  return (
    <div className={classNames(styles.docsMainBlock)} {...rest}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Composer components={providers}>
          {children}
        </Composer>
      </ErrorBoundary>
    </div>
  );
}
