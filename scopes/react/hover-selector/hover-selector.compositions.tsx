import React, { useState } from 'react';
import { HoverSelector } from './hover-selector';

export function Preview() {
  const [current, setCurrent] = useState<HTMLElement | null>(null);

  return (
    <div>
      <HoverSelector onElementChange={setCurrent}>
        <div>hover me!</div>
        <span>hover me!</span>
      </HoverSelector>
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
