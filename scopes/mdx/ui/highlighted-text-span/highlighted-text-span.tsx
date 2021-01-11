import React, { HTMLAttributes } from 'react';
import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';

export function HighlightedTextSpan({ children, className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <HighlightedText {...rest} className={className} element="span" size="xxs">
      {children}
    </HighlightedText>
  );
}
