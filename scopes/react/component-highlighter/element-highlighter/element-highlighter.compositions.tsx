import React, { useState, createRef, useEffect, CSSProperties } from 'react';
import { ElementHighlighter } from './element-highlighter';
import { MockTarget } from '../mock-component';

type HighlightedElementProps = {
  style?: CSSProperties;
  targetStyle?: CSSProperties;
  className?: string;
  watchMotion?: boolean;
};

export const HighlightedElement = ({ style, targetStyle, watchMotion, className }: HighlightedElementProps) => {
  const targetRef = createRef<HTMLDivElement>();

  return (
    <div className={className} style={{ padding: '16px 16px 40px 16px', width: 300, fontFamily: 'sans-serif' }}>
      <div ref={targetRef} style={{ width: 100, ...targetStyle }}>
        highlight target
      </div>

      <ElementHighlighter
        targetRef={targetRef}
        components={[MockTarget]}
        style={style}
        watchMotion={watchMotion}
        placement="bottom"
      />
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
      <HighlightedElement style={{ fontSize: 10 }} />
      <HighlightedElement style={{ fontSize: 14 }} />
      <HighlightedElement style={{ fontSize: 18 }} />
    </div>
  );
};

const fps = 30;
const frameInterval = 1000 / fps;

export const MovingElement = () => {
  const [margin, setMargin] = useState(0);

  useEffect(() => {
    const intervalId = setInterval(() => setMargin((x) => (x + 1) % 100), frameInterval);
    return () => clearInterval(intervalId);
  }, []);

  return <HighlightedElement targetStyle={{ marginLeft: margin }} watchMotion />;
};

export const ElementOnTheEdge = () => {
  const targetRef = createRef<HTMLDivElement>();

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <div ref={targetRef} style={{ width: '100%', border: '1px solid black', boxSizing: 'border-box' }}>
        This element is on the edge of the document, making the highlighter overflow. <br />
        It should instead shrink to fit inside the document.
      </div>
      <ElementHighlighter targetRef={targetRef} components={[MockTarget]} watchMotion />
    </div>
  );
};
