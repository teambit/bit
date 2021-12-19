import { useEffect } from 'react';

// TODO - extract to its own component

export function useAnimationFrame(cb?: false | null | (() => any), deps: any[] = []) {
  useEffect(() => {
    if (!cb) return () => {};

    let animationFrameId = -1;
    const animate = () => {
      cb();
      animationFrameId = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      if (animationFrameId > -1) window.cancelAnimationFrame(animationFrameId);
    };
  }, [cb, ...deps]);
}
