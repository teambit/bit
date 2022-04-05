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

export const FullscreenElement = () => {
  const targetRef = createRef<HTMLDivElement>();

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <div
        ref={targetRef}
        style={{
          height: '100vh',
          width: '100%',
          background: '#bceed4',
        }}
      >
        This element will cover the entire document,
        <br />
        pushing the highlighter to the edge of the window.
        <br />
        The highlighter should remain inside and expand no further than the document.
      </div>
      <ElementHighlighter targetRef={targetRef} components={[MockTarget]} watchMotion />
    </div>
  );
};

const edgeStyles = { position: 'absolute', background: 'cyan', padding: 30 } as const;
const centerStyles = {
  top: { top: -30, left: '50%', transform: 'translate(-50%,0)' },
  right: { right: -30, top: '50%', transform: 'translate(0, -50%)' },
  bottom: { bottom: -30, left: '50%', transform: 'translate(-50%,0)' },
  left: { left: -30, top: '50%', transform: 'translate(0, -50%)' },
};

export function OffscreenElements() {
  const target01 = createRef<HTMLDivElement>();
  const target02 = createRef<HTMLDivElement>();
  const target03 = createRef<HTMLDivElement>();
  const target04 = createRef<HTMLDivElement>();

  return (
    <div style={{ fontFamily: 'sans-serif', height: '100%' }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <div ref={target01} style={{ ...edgeStyles, ...centerStyles.top }}>
          top
        </div>
        <div ref={target02} style={{ ...edgeStyles, ...centerStyles.right }}>
          right
        </div>
        <div ref={target03} style={{ ...edgeStyles, ...centerStyles.bottom }}>
          bottom
        </div>
        <div ref={target04} style={{ ...edgeStyles, ...centerStyles.left }}>
          left
        </div>
        <ElementHighlighter targetRef={target01} components={[MockTarget]} watchMotion />
        <ElementHighlighter targetRef={target02} components={[MockTarget]} watchMotion />
        <ElementHighlighter targetRef={target03} components={[MockTarget]} watchMotion />
        <ElementHighlighter targetRef={target04} components={[MockTarget]} watchMotion />
      </div>
    </div>
  );
}
