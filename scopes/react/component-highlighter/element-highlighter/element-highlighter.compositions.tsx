import { componentMetaField } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import React, { useState, createRef, useEffect, CSSProperties } from 'react';
import { ElementHighlighter, HighlighterSize, HighlightTarget } from './element-highlighter';

const mockTarget: Partial<HighlightTarget> = {
  components: [
    {
      [componentMetaField]: {
        id: 'teambit.design/ui/icon-button@1.6.2',
      },
    },
  ],
};

type HighlightedElementProps = {
  style?: CSSProperties;
  targetStyle?: CSSProperties;
  className?: string;
  watchMotion?: boolean;
  size?: HighlighterSize;
};

export const HighlightedElement = ({ style, targetStyle, watchMotion, className, size }: HighlightedElementProps) => {
  const [targetElement, setTargetElement] = useState<HTMLElement | undefined>(undefined);
  const targetRef = createRef<HTMLDivElement>();

  useEffect(() => setTargetElement(targetRef.current || undefined), [targetRef.current]);
  const target = targetElement && { ...mockTarget, element: targetElement };

  return (
    <div className={className} style={{ padding: '16px 16px 40px 16px', width: 300 }}>
      <div ref={targetRef} style={{ width: 100, ...targetStyle }}>
        highlight target
      </div>
      {target && (
        <ElementHighlighter target={target} style={style} watchMotion={watchMotion} placement="bottom" size={size} />
      )}
    </div>
  );
};

export const Customized = () => {
  return (
    <HighlightedElement
      style={
        {
          '--bit-highlighter-color': '#94deb4',
          '--bit-highlighter-color-hover': '#d0f1de',
          '--bit-highlighter-color-active': '#37b26c',
        } as CSSProperties
      }
    />
  );
};

export const Sizes = () => {
  return (
    <div>
      <HighlightedElement size="s" />
      <HighlightedElement size="m" />
      <HighlightedElement size="l" />
    </div>
  );
};

export const MovingElement = () => {
  const [margin, setMargin] = useState(0);

  useEffect(() => {
    const intervalId = setInterval(() => setMargin((x) => (x + 1) % 100), 80);
    return () => clearInterval(intervalId);
  }, []);

  return <HighlightedElement targetStyle={{ marginLeft: margin }} />;
};
