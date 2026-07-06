import type { HTMLAttributes } from 'react';
import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Composer } from '@teambit/base-ui.utils.composer';
import { ErrorFallback } from '@teambit/react.ui.error-fallback';

import type { RenderingContext } from '@teambit/preview';

// the react env aspect-id. don't import it from @teambit/react - that would make the react env a
// dependency of this component, creating a circular dependency (the env depends on this component
// through its docs template).
const ReactAspectId = 'teambit.react/react';

export type ApplyProvidersProps = {
  renderingContext: RenderingContext;
  children: React.ReactNode;
} & HTMLAttributes<HTMLDivElement>;

/**
 * applies providers from rendering context, and error boundary
 */
export function ApplyProviders({ renderingContext, children, ...rest }: ApplyProvidersProps) {
  const { providers = [] } = renderingContext.get(ReactAspectId) || {};

  return (
    <div {...rest}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Composer components={providers}>{children}</Composer>
      </ErrorBoundary>
    </div>
  );
}
