import { useEffect, useState, useRef } from 'react';

export enum TransitionStage {
  entering = 'entering',
  entered = 'entered',
  exiting = 'exiting',
  exited = 'exited',
  appear = 'appear',
}

export function useInOutTransition(value: boolean, duration: number) {
  const [state, setState] = useState(value ? TransitionStage.appear : TransitionStage.exited);
  const isInitialRun = useRef(true);
  const durationRef = useRef(duration);
  durationRef.current = duration; // use latest

  useEffect(() => {
    if (isInitialRun.current) {
      isInitialRun.current = false;
      return () => {};
    }

    setState(value ? TransitionStage.entering : TransitionStage.exiting);
    const tmId = setTimeout(() => {
      const next = value ? TransitionStage.entered : TransitionStage.exited;
      setState(next);
    }, durationRef.current);

    return () => clearTimeout(tmId);
  }, [value]);

  return state;
}
