import React, { HTMLAttributes } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Composer } from '@teambit/base-ui.utils.composer';
import { ErrorFallback } from '@teambit/react.ui.error-fallback';

import { RenderingContext } from '@teambit/preview';
import { ReactAspect } from '@teambit/react';

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
    <div {...rest}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Composer components={providers}>
          {children}
        </Composer>
      </ErrorBoundary>
    </div>
  );
}
