import React, { useState, useEffect, ReactNode, FC } from 'react';
import { ComponentHighlighter } from '@teambit/ui.component-highlighter';
import type { PubsubPreview } from '@teambit/pubsub';

// not amazing.
import { ToggleHighlightEvent } from '@teambit/compositions';

export function createHighlighter(pubsubPreview: PubsubPreview) {
  const Highlighter: FC = ({ children }: { children?: ReactNode }) => {
    const [isActive, setActive] = useState(true);

    useEffect(() => {
      pubsubPreview.sub(ToggleHighlightEvent.topic, (event: ToggleHighlightEvent) => {
        setActive(event.data.shouldHighlight);
      });
    }, []);

    return (
      <ComponentHighlighter disabled={!isActive}>
        <div>active: {isActive.toString()}?</div>
        {children}
      </ComponentHighlighter>
    );
  };
  return Highlighter;
}
