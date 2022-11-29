import React, { useMemo } from 'react';
import classNames from 'classnames';
import { ErrorBoundary } from 'react-error-boundary';
import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import { colorPalette } from '@teambit/base-ui.theme.accent-color';
import { CompositionType } from '@teambit/compositions.model.composition-type';
import { ErrorFallback, ErrorFallbackProps } from '@teambit/react.ui.error-fallback';
import { humanizeCompositionId } from '@teambit/compositions.model.composition-id';
import { Icon } from '@teambit/evangelist.elements.icon';
import { themedText } from '@teambit/base-ui.text.themed-text';
import styles from './composition-card.module.scss';

export interface CompositionCardProps extends CardProps {
  Composition: CompositionType;
  name: string;
  link?: string;
}

export function CompositionCard({ Composition, name, link, className, ...rest }: CompositionCardProps) {
  const { canvas, compositionName } = Composition;

  const humanizedName = useMemo(() => compositionName || humanizeCompositionId(name), [name, compositionName]);

  return (
    <Card elevation="low" className={classNames(className, styles.compositionCard)} {...rest}>
      <ErrorBoundary FallbackComponent={CompositionErrorFallback}>
        <div style={canvas} className={styles.compositionContainer}>
          <Composition />
        </div>
      </ErrorBoundary>
      <div className={classNames(styles.title, colorPalette.neutralHeavy, themedText)}>
        <span>{humanizedName}</span>
        {link && (
          <a className={styles.linkToComposition} target="_blank" rel="noopener noreferrer" href={link}>
            <Icon of="open-tab" />
          </a>
        )}
      </div>
    </Card>
  );
}

export function CompositionErrorFallback(props: ErrorFallbackProps) {
  return <ErrorFallback {...props} className={classNames(props.className, styles.compositionCardError)} />;
}
