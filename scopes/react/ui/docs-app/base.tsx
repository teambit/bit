import React, { HTMLAttributes } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import classNames from 'classnames';
import { Composer } from '@teambit/base-ui.utils.composer';
import { ErrorFallback } from '@teambit/react.ui.error-fallback';
import { RenderingContext } from '@teambit/preview';
import { ReactAspect } from '@teambit/react';
import styles from './base.module.scss';

// import { ExamplesOverview } from './examples-overview';

export type DocsSectionProps = {
  renderingContext: RenderingContext;
  children: React.ReactNode;
} & HTMLAttributes<HTMLDivElement>;



/**
 * base template for react component documentation
 */
export function Base({ renderingContext, children, ...rest }: DocsSectionProps) {

  const { providers = [] } = renderingContext.get(ReactAspect.id) || {};

  // const { examples = [] } = docs;

  return (
    <div className={classNames(styles.docsMainBlock)} {...rest}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Composer components={providers}>
          {children}
          {/* <ExamplesOverview examples={Content.examples || examples} /> */}
        </Composer>
      </ErrorBoundary>
    </div>
  );
}
