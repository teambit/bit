import React, { ComponentType } from 'react';
import { Composer } from '@teambit/base-ui.utils.composer';
import { StandaloneNotFoundPage } from '@teambit/design.ui.pages.standalone-not-found-page';
import { RenderingContext } from '@teambit/preview';
import { ErrorFallback } from '@teambit/react.ui.error-fallback';
import { useFallback } from '@teambit/react.ui.loader-fallback';
import { ErrorBoundary } from 'react-error-boundary';

// hide scrollbars so they won't be visible in the preview at the component card (and it's ok not to show them in the compositions page)
const hideScrollbars = 'body::-webkit-scrollbar {display: none;}';

export function CompositionsApp({
  Composition,
  previewContext,
}: {
  Composition?: ComponentType;
  previewContext?: RenderingContext;
}) {
  const { providers = [] } = previewContext?.get('teambit.react/react') || {};

  const safeComposition = useFallback(Composition && <Composition />, <StandaloneNotFoundPage />);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} resetKeys={[Composition]}>
      <Composer components={providers}>
        <style>{hideScrollbars}</style>
        {safeComposition}
      </Composer>
    </ErrorBoundary>
  );
}
