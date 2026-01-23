import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  BROADCAST_READY_KEY,
  BROADCAST_UPDATE_KEY,
  BROADCAST_DESTROY_KEY,
  type Control,
} from './composition-live-controls';
import { LiveControlsRegistry } from './live-controls-registry';

export type UseLiveControlsResult = {
  defs: Array<Control>;
  values: Record<string, any>;
  ready: boolean;
  hasLiveControls: boolean;
  onChange: (key: string, value: any) => void;
  setTimestamp: (ts: number) => void;
};

export function useLiveControls(channels?: string[]): UseLiveControlsResult {
  const liveControlsRegistry = LiveControlsRegistry.getInstance();

  const activeChannels = useMemo(() => (channels?.length ? channels : ['default']), [channels]);
  const hasLiveControls = liveControlsRegistry.hasAnySubscribers;
  const [state, setState] = useState(() => liveControlsRegistry.getMergedState(activeChannels));

  const onEvent = useCallback(
    (event: MessageEvent) => {
      const { data } = event;
      if (!data?.type) return;

      if (data.type === 'composition-live-controls:activate') {
        setState(liveControlsRegistry.getMergedState(activeChannels));
        return;
      }

      const channel = data.payload?.channel || 'default';
      if (!activeChannels.includes(channel)) return;

      if (data.type === BROADCAST_READY_KEY) {
        liveControlsRegistry.register(channel, event.source as Window, data.payload.timestamp);

        liveControlsRegistry.registerReadyState(
          channel,
          data.payload.controls,
          data.payload.values,
          data.payload.timestamp,
          event.source as Window
        );
      }

      if (data.type === BROADCAST_UPDATE_KEY) {
        liveControlsRegistry.updateValue(channel, data.payload.key, data.payload.value);
      }

      if (data.type === BROADCAST_DESTROY_KEY) {
        liveControlsRegistry.unregister(channel, event.source as Window);
      }

      setState(liveControlsRegistry.getMergedState(activeChannels));
    },
    [activeChannels]
  );

  useEffect(() => {
    window.addEventListener('message', onEvent);
    return () => window.removeEventListener('message', onEvent);
  }, [onEvent]);

  const onChange = (key: string, value: any) => {
    liveControlsRegistry.broadcastUpdateToChannels(activeChannels, key, value);
  };

  const setTimestamp = (ts: number) => {
    if (ts === 0) {
      liveControlsRegistry.resetTimestamps(activeChannels);
      setState(liveControlsRegistry.getMergedState(activeChannels));
    }
  };

  return {
    defs: state.defs,
    values: state.values,
    ready: state.ready,
    hasLiveControls,
    onChange,
    setTimestamp,
  };
}
