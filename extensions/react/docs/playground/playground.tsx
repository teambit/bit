import { roundnessClass } from '@teambit/base-ui.css-components.roundness';
import { Error as errorClass } from '@teambit/base-ui.input.error';
import classNames from 'classnames';
import prismTheme from 'prism-react-renderer/themes/github';
import React from 'react';
import { LiveEditor, LiveError, LivePreview, LiveProvider } from 'react-live';

import styles from './playground.module.scss';

export type CodeScope = { [key: string]: any };
export type PlaygroundProps = {
  code: string;
  scope?: CodeScope;
};

export function Playground({ code, scope }: PlaygroundProps) {
  return (
    <LiveProvider code={code} scope={scope} theme={prismTheme}>
      <LivePreview className={classNames(styles.preview, roundnessClass.default)} />
      <LiveError className={classNames(errorClass, styles.error)} />
      <LiveEditor className={classNames(roundnessClass.default, styles.editor)} />
    </LiveProvider>
  );
}
