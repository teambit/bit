import React from 'react';
import { OptionButton } from '@teambit/ui.input.option-button';
import { Tooltip } from '@teambit/ui.tooltip';
import { usePreviewQueryParams } from '@teambit/ui.hooks.use-composition';

const PARAM_NAME = 'highlighter';

export function HighlighterWidget() {
  const [active, setActive] = usePreviewQueryParams(PARAM_NAME);

  return (
    <Tooltip content="Component Highlighter (beta)">
      {/* tooltip requires child with ref */}
      <span>
        <OptionButton icon="highlighter-toggle" onClick={() => setActive(!active)} active={active} />
      </span>
    </Tooltip>
  );
}
