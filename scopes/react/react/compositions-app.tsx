import React from 'react';
import { Composer } from '@teambit/base-ui.utils.composer';
import { StandaloneNotFoundPage } from '@teambit/design.ui.pages.standalone-not-found-page';
import { RenderingContext } from '@teambit/preview';
import { ErrorFallback } from '@teambit/react.ui.error-fallback';
import { LoaderFallback } from '@teambit/react.ui.loader-fallback';
import { ErrorBoundary } from 'react-error-boundary';
import { ReactAspect } from './react.aspect';

// hide scrollbars so they won't be visible in the preview at the component card (and it's ok not to show them in the compositions page)
const hideScrollbars = 'body::-webkit-scrollbar {display: none;}';

export function CompositionsApp({
  Composition,
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
        <style>{hideScrollbars}</style>
        <LoaderFallback Target={Composition} DefaultComponent={StandaloneNotFoundPage} />
      </Composer>
    </ErrorBoundary>
  );
}
