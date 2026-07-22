import type { HTMLAttributes } from 'react';
import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Composer } from '@teambit/base-ui.utils.composer';
import { ErrorFallback } from '@teambit/react.ui.error-fallback';

import type { RenderingContext } from '@teambit/preview';

export type ApplyProvidersProps = {
  renderingContext: RenderingContext;
  children: React.ReactNode;
} & HTMLAttributes<HTMLDivElement>;

/**
 * applies providers from rendering context, and error boundary
 */
export function ApplyProviders({ renderingContext, children, ...rest }: ApplyProvidersProps) {
  // react env aspect id, inlined to avoid a source dependency on the react env package
  const { providers = [] } = renderingContext.get('teambit.react/react') || {};

  return (
    <div {...rest}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Composer components={providers}>{children}</Composer>
      </ErrorBoundary>
    </div>
  );
}
