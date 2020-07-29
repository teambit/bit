import React from 'react';
import classNames from 'classnames';
import { LiveProvider, LiveEditor, LiveError, LivePreview } from 'react-live';

import prismTheme from 'prism-react-renderer/themes/github';
import { errorClass } from '@bit/bit.base-ui.input.error';
import { roundnessClass } from '@bit/bit.base-ui.css-components.roundness';

import styles from './playground.module.scss';

export type CodeScope = { [key: string]: any };

export type PlaygroundProps = {
  code: string;
  scope: CodeScope;
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
