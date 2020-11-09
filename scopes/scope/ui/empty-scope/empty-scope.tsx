import React from 'react';
import { NoComponents, NoComponentsProps } from '@teambit/ui.no-components';
import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';
import styles from './empty-scope.module.scss';

export type EmptyScopeProps = { name: string } & NoComponentsProps;

/**
 * A component to show when the scope is empty
 */
export function EmptyScope({ name }: EmptyScopeProps) {
  return (
    <NoComponents name={name}>
      <div className={styles.text}>
        <span>Set</span>&nbsp;
        <HighlightedText size="xxs" element="span">
          {`“defaultScope”: “${name}"`}
        </HighlightedText>
        &nbsp;
        <span>in</span>&nbsp;
        <HighlightedText size="xxs" element="span">
          workspace.jsonc
        </HighlightedText>
        &nbsp;
        <span>file and export components here.</span>
      </div>
    </NoComponents>
  );
}
