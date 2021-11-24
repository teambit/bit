import React from 'react';

import { HybridHighlighter, HybridHighlighterProps } from '../hybrid-highligher';

export type MultiHighlighterProps = Omit<HybridHighlighterProps, 'mode'>;

export function MultiHighlighter({ watchMotion = false, ...props }: MultiHighlighterProps) {
  return <HybridHighlighter {...props} mode={'allChildren'} watchMotion={watchMotion} />;
}
