import React, { useState } from 'react';
import { MouseHoverSelector } from './mouse-hover-selector';

export function Preview() {
  const [current, setCurrent] = useState<HTMLElement | null>(null);

  return (
    <div>
      <MouseHoverSelector onElementChange={setCurrent}>
        <div>hover me!</div>
        <span>hover me!</span>
      </MouseHoverSelector>
      <div>
        results:
        <br />
        <div>
          <code style={{ background: '#fafafa' }}>{current?.outerHTML || 'NULL'}</code>
        </div>
      </div>
    </div>
  );
}
