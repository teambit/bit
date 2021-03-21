import React, { useState, useEffect, ReactNode, FC } from 'react';
import { ComponentHighlighter } from '@teambit/ui.component-highlighter';
import type { PubsubPreview } from '@teambit/pubsub';

import { ToggleHighlightEvent } from './toggle-highlight-event';

export function createHighlighter(pubsubPreview: PubsubPreview) {
  const Highlighter: FC = ({ children }: { children?: ReactNode }) => {
    const [isActive, setActive] = useState(false);

    useEffect(() => {
      pubsubPreview.sub(ToggleHighlightEvent.topic, (event: ToggleHighlightEvent) => {
        setActive(event.data.shouldHighlight);
      });
    }, []);

    return <ComponentHighlighter disabled={!isActive}>{children}</ComponentHighlighter>;
  };
  return Highlighter;
}
