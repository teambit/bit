import React from 'react';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { Tooltip, TooltipProps } from '@teambit/design.ui.tooltip';
import styles from './menu.module.scss';

type TooltipCopyboxProps = {
  content: string;
} & TooltipProps;

// consider adding tooltip to the CopyBox directly, using `props.tooltip ? Tooltip : (Noop as Tooltip);`
// forward ref required by tippy
export function TooltipCopybox({ content, ...rest }: TooltipCopyboxProps) {
  return (
    <Tooltip {...rest} content={content} placement="bottom" maxWidth="" breakline>
      <div>
        <CopyBox className={styles.copyBox}>{content}</CopyBox>
      </div>
    </Tooltip>
  );
}
