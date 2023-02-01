import { useEffect, useState } from 'react';

export function useDragListener(onDrag: (event: MouseEvent | Touch) => void) {
  const draggingState = useState(false);
  const [isDragging, setDragging] = draggingState;

  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      const { touches } = e;
      const mainTouch = touches[0];

      onDrag(mainTouch);
    };

    const handleMouseMove = (e: MouseEvent) => {
      onDrag(e);
    };

    const handleDragEnded = () => {
      setDragging(false);
    };

    const handleMouseEnter = (e: MouseEvent) => {
      // mouse has left the screen, and returned, still holding the left-button
      if (e && e.buttons === 1) return;

      handleDragEnded();
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleDragEnded);
      document.addEventListener('mouseenter', handleMouseEnter);

      document.addEventListener('touchend', handleDragEnded);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchcancel', handleDragEnded);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleDragEnded);
      document.removeEventListener('mouseenter', handleMouseEnter);

      document.removeEventListener('touchend', handleDragEnded);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchcancel', handleDragEnded);
    };
  }, [isDragging, onDrag]);

  return draggingState;
}
