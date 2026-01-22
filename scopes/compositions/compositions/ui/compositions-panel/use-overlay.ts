import React from 'react';
import ReactDOM from 'react-dom';

export type OverlayPosition = 'top' | 'bottom';

export type OverlayStyle = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

const GAP = 8;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 240;

export function useOverlay(anchorRef: React.RefObject<HTMLElement>, open: boolean) {
  const [position, setPosition] = React.useState<OverlayPosition>('bottom');
  const [style, setStyle] = React.useState<OverlayStyle | null>(null);

  React.useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    const rect = anchorRef.current.getBoundingClientRect();

    const below = window.innerHeight - rect.bottom - GAP;
    const above = rect.top - GAP;

    const maxHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, below));
    const shouldFlip = below < MIN_HEIGHT && above > below;

    const pos: OverlayPosition = shouldFlip ? 'top' : 'bottom';

    setPosition(pos);
    setStyle({
      left: rect.left,
      width: rect.width,
      maxHeight,
      top: pos === 'bottom' ? rect.bottom + GAP : undefined,
      bottom: pos === 'top' ? window.innerHeight - rect.top + GAP : undefined,
    });
  }, [open]);

  return { position, style };
}

export function BitPortal({ children }: { children: React.ReactNode }) {
  return ReactDOM.createPortal(children, document.body);
}
