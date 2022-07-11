// import 'reset-css'; // do not include resets, we want compositions with native behavior
import React from 'react';
import classNames from 'classnames';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { IconFont } from '@teambit/design.theme.icons-font';
import styles from './docs-app.module.scss';

export type DocsAppProps = {
  children: React.ReactChild
};

export function DocsTheme({
  children
}: DocsAppProps) {
  return (
    <ThemeContext>
      <IconFont query="q76y7n" />
      <div className={classNames(styles.docsMainBlock)}>
        {children}
      </div>
    </ThemeContext>
  );
}
