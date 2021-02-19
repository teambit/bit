import React, { HTMLAttributes } from 'react';
import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';

export function HighlightedTextSpan({ children, className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <HighlightedText {...rest} className={className} element="span" size="xs">
      {children}
    </HighlightedText>
  );
}
