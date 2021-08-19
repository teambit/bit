import React from 'react';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { Tooltip } from '@teambit/design.ui.tooltip';

type TooltipCopyboxProps = {
  content: string;
};

export function TooltipCopybox({ content }: TooltipCopyboxProps) {
  return (
    <Tooltip content={content} placement="bottom">
      <div>
        <CopyBox>{content}</CopyBox>
      </div>
    </Tooltip>
  );
}
