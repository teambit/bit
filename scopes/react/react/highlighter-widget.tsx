import React, { useState } from 'react';
import { PubsubUI } from '@teambit/pubsub';
import { ToggleHighlightEvent } from '@teambit/ui.highlighter';
import { OptionButton } from '@teambit/ui.input.option-button';
import { Tooltip } from '@teambit/ui.tooltip';

export function HighlighterWidget({ pubSub }: { pubSub: PubsubUI }) {
  const [active, setActive] = useState(false);

  const handleHighlightToggle = () => {
    const next = !active;
    setActive(next);

    const event = new ToggleHighlightEvent(next);
    pubSub.pub(ToggleHighlightEvent.topic, event);
  };

  return (
    <Tooltip content="Component Highlighter (beta)">
      {/* tooltip requires child with ref */}
      <span>
        <OptionButton icon="highlighter-toggle" onClick={handleHighlightToggle} active={active} />
      </span>
    </Tooltip>
  );
}
