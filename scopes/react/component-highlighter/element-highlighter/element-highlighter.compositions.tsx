import React, { useState, createRef, useEffect, CSSProperties } from 'react';
import { ElementHighlighter, HighlightTarget } from './element-highlighter';

const mockTarget: Partial<HighlightTarget> = {
  id: 'teambit.design/ui/icon-button',
  link: 'https://bit.dev/teambit/design/ui/icon-button',
  scopeLink: 'https://bit.dev/teambit/design',
};

type HighlightedElementProps = {
  style?: CSSProperties;
  targetStyle?: CSSProperties;
  className?: string;
};

export const HighlightedElement = ({ style, targetStyle, className }: HighlightedElementProps) => {
  const [targetElement, setTargetElement] = useState<HTMLElement | undefined>(undefined);
  const targetRef = createRef<HTMLDivElement>();

  useEffect(() => setTargetElement(targetRef.current || undefined), [targetRef.current]);
  const target = targetElement && { ...mockTarget, element: targetElement };

  return (
    <div className={className} style={{ padding: '16px 160px 50px 16px' }}>
      <div ref={targetRef} style={{ width: 100, ...targetStyle }}>
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

export const MovingElement = () => {
  const [margin, setMargin] = useState(0);

  useEffect(() => {
    const intervalId = setInterval(() => setMargin((x) => (x + 1) % 100), 80);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <HighlightedElement style={{ padding: '16px 16px 50px 16px', width: 250 }} targetStyle={{ marginLeft: margin }} />
  );
};
