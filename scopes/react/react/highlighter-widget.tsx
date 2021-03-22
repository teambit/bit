import React, { useState } from 'react';
import { PubsubUI } from '@teambit/pubsub';
import { ToggleHighlightEvent } from '@teambit/ui.highlighter';
import { OptionButton } from '@teambit/ui.input.option-button';

export function HighlighterWidget({ pubSub }: { pubSub: PubsubUI }) {
  const [active, setActive] = useState(false);

  const handleHighlightToggle = () => {
    const next = !active;
    setActive(next);

    const event = new ToggleHighlightEvent(next);
    pubSub.pub(ToggleHighlightEvent.topic, event);
  };

  return (
    <OptionButton
      icon="highlighter-toggle"
      // tooltipContent="Component Highlighter (beta)"
      onClick={handleHighlightToggle}
      active={active}
    />
  );
}
