import React, { useState, createRef, useEffect } from 'react';
import { ElementHighlighter, HighlightTarget } from './element-highlighter';

export const HighlightedElement = () => {
  const [target, setTarget] = useState<HighlightTarget | undefined>(undefined);
  const targetRef = createRef<HTMLDivElement>();

  useEffect(() => {
    const { current } = targetRef;
    if (!current) return;

    setTarget({
      element: current,
      id: 'teambit.design/input/button',
    });
  }, [targetRef.current]);

  return (
    <div style={{ padding: 16 }}>
      <div ref={targetRef} style={{ width: 100 }}>
        highlight target
      </div>
      {target && <ElementHighlighter target={target} />}
    </div>
  );
};
