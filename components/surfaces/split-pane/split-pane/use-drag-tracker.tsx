import React, { RefObject, useCallback, useState } from 'react';

import { toRelativePosition } from './to-relative-position';
import { useDragListener } from './use-pointer-drag';

export type DragSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Coords = {
  clientX: number;
  clientY: number;
};

export function useDragTracker(containerRef: RefObject<HTMLDivElement>) {
  const [snapshot, setSnapshot] = useState<DragSnapshot | undefined>(undefined);

  // TODO - resize observer

  const handleDrag = useCallback(
    ({ clientX, clientY }: Coords) => {
      if (!containerRef.current) return;

      const position = toRelativePosition({
        clientX,
        clientY,
        element: containerRef.current,
      });

      setSnapshot(position);
    },
    [containerRef]
  );

  const [isDragging, setDragging] = useDragListener(handleDrag);

  return [snapshot, isDragging, setDragging] as [
    DragSnapshot | undefined,
    boolean,
    React.Dispatch<React.SetStateAction<boolean>>
  ];
}
