import React, { useState } from 'react';
import { IconButton } from '@teambit/design.ui.icon-button';
import { HoverHighlighter } from './hover-highlighter';

export const ShowWhenHovering = () => {
  const [disabled, setDisabled] = useState<boolean>(false);

  return (
    <div style={{ padding: '16px 80px 32px 16px' }}>
      <HoverHighlighter style={{ padding: 16 }} disabled={disabled}>
        <div>
          some div
          <br />
          <div>
            <IconButton onClick={() => setDisabled((x) => !x)}>Hover here</IconButton>
          </div>
        </div>
      </HoverHighlighter>
    </div>
  );
};
