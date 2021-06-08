import React from 'react';
import { Composer } from '@teambit/base-ui.utils.composer/dist/composer';
import { StandaloneNotFoundPage } from '@teambit/design.ui.pages.standalone-not-found-page';
import { RenderingContext } from '@teambit/preview';
import { ErrorFallback } from '@teambit/react.ui.error-fallback';
import { ErrorBoundary } from 'react-error-boundary';
import { ReactAspect } from './react.aspect';

export function CompositionsApp({
  Composition = StandaloneNotFoundPage,
  previewContext,
}: {
  Composition?: React.ComponentType;
  previewContext: RenderingContext;
}) {
  const reactContext = previewContext.get(ReactAspect.id);
  const providers = reactContext?.providers || [];

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} resetKeys={[Composition]}>
      <Composer components={providers}>
        <Composition />
      </Composer>
    </ErrorBoundary>
  );
}
