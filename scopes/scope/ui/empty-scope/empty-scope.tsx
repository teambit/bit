import React from 'react';
import { NoComponents } from '@teambit/ui.no-components';
import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';
import styles from './empty-scope.module.scss';

export function EmptyScope({ name }: { name: string }) {
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
