import React from 'react';

import { HybridHighlighter, HybridHighlighterProps } from '../hybrid-highligher';

export interface MultiHighlighterProps extends Omit<HybridHighlighterProps, 'mode'> {
  disabled?: boolean;
}

export function MultiHighlighter({ disabled, ...props }: MultiHighlighterProps) {
  return <HybridHighlighter {...props} mode={disabled ? 'disabled' : 'allChildren'} />;
}
