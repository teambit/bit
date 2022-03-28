import React, { useState } from 'react';
import { IconButton } from '@teambit/design.ui.icon-button';
import { HoverHighlighter } from './hover-highlighter';

export const ShowWhenHovering = () => {
  const [disabled, setDisabled] = useState<boolean>(false);

  return (
    <div style={{ padding: '16px 50px 32px 16px', minWidth: 300, fontFamily: 'sans-serif' }}>
      <HoverHighlighter style={{ padding: 16 }} disabled={disabled}>
        <div>
          <br />
          <div>
            <IconButton onClick={() => setDisabled((x) => !x)}>
              Hover here
              <IconButton onClick={() => setDisabled((x) => !x)}>Hover here</IconButton>
            </IconButton>
          </div>
          <div>
            {disabled ? 'X' : '✓'} highlighter is {disabled ? 'disabled' : 'enabled'}
          </div>
        </div>
      </HoverHighlighter>
    </div>
  );
};
