import React from 'react';
import { HybridHighlighter, HybridHighlighterProps } from '../hybrid-highligher';

export interface HoverHighlighterProps extends Omit<HybridHighlighterProps, 'mode'> {
  disabled?: boolean;
}

export function HoverHighlighter({ disabled, ...props }: HoverHighlighterProps) {
  return <HybridHighlighter {...props} mode={disabled ? 'disabled' : 'hover'} />;
}
