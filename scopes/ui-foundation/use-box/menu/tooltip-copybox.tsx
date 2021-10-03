import React from 'react';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { Tooltip } from '@teambit/design.ui.tooltip';

type TooltipCopyboxProps = {
  content: string;
};

// consider adding tooltip to the CopyBox directly, using `props.tooltip ? Tooltip : (Noop as Tooltip);`
// forward ref required by tippy
export function TooltipCopybox({ content }: TooltipCopyboxProps) {
  return (
    <Tooltip content={content} placement="bottom" maxWidth="">
      <div>
        <CopyBox>{content}</CopyBox>
      </div>
    </Tooltip>
  );
}
