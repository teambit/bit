import React from 'react';

import { HybridHighlighter, HybridHighlighterProps } from '../hybrid-highlighter';

export type ChildrenHighlighterProps = Omit<HybridHighlighterProps, 'mode'>;

export function ChildrenHighlighter({ watchMotion = false, ...props }: ChildrenHighlighterProps) {
  return <HybridHighlighter {...props} mode={'allChildren'} watchMotion={watchMotion} />;
}
