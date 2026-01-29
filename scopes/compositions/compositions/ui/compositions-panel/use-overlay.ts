import React from 'react';
import ReactDOM from 'react-dom';

export type OverlayPosition = 'top' | 'bottom';

export type OverlayStyle = {
  top?: number;
  bottom?: number;
  left: number;
  maxWidth: number;
  maxHeight: number;
} & React.CSSProperties;

const GAP = 4;

export function useOverlay(
  anchorRef: React.RefObject<HTMLElement>,
  open: boolean,
  gap: number = GAP,
  extraStyle?: React.CSSProperties
) {
  const [position, setPosition] = React.useState<OverlayPosition>('bottom');
  const [style, setStyle] = React.useState<OverlayStyle | null>(null);

  React.useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    const rect = anchorRef.current.getBoundingClientRect();

    const below = window.innerHeight - rect.bottom - gap;
    const above = rect.top - gap;

    const shouldFlip = below < 240 && above > below;

    const pos: OverlayPosition = shouldFlip ? 'top' : 'bottom';

    setPosition(pos);
    setStyle({
      ...extraStyle,
      left: rect.left,
      maxWidth: rect.width,
      maxHeight: 240,
      top: pos === 'bottom' ? rect.bottom + gap : undefined,
      bottom: pos === 'top' ? window.innerHeight - rect.top + gap : undefined,
    });
  }, [open]);

  return { position, style };
}

export function BitPortal({ children }: { children: React.ReactNode }) {
  return ReactDOM.createPortal(children, document.body);
}
