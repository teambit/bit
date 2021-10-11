import React, { useState, createRef, useEffect } from 'react';
import { ElementHighlighter, HighlightTarget } from './element-highlighter';

const mockTargetId = 'teambit.design/ui/icon-button';

export const HighlightedElement = ({ style, className }: { style?: Record<string, string>; className?: string }) => {
  const [targetElement, setTargetElement] = useState<HTMLElement | undefined>(undefined);
  const targetRef = createRef<HTMLDivElement>();

  useEffect(() => {
    const { current } = targetRef;
    setTargetElement(current || undefined);
  }, [targetRef.current]);

  const target: HighlightTarget | undefined = targetElement && {
    element: targetElement,
    id: mockTargetId,
    link: 'https://bit.dev/teambit/design/ui/icon-button',
    scopeLink: 'https://bit.dev/teambit/design',
  };

  return (
    <div className={className} style={{ padding: '16px 160px 50px 16px' }}>
      <div ref={targetRef} style={{ width: 100 }}>
        highlight target
      </div>
      {target && <ElementHighlighter target={target} style={style} placement="bottom" />}
    </div>
  );
};

export const Customized = () => {
  return (
    <HighlightedElement
      style={{
        '--bit-highlighter-color': '#94deb4',
        '--bit-highlighter-color-hover': '#d0f1de',
        '--bit-highlighter-color-active': '#37b26c',
      }}
    />
  );
};

export const Sizes = () => {
  return <HighlightedElement style={{ fontSize: '16px' }} />;
};
