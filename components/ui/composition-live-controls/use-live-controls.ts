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
      const sourceWindow = event.source as Window | null;

      if (data.type === 'composition-live-controls:activate') {
        const activateChannel = liveControlsRegistry.resolveChannel(data.payload?.channel, sourceWindow || undefined);
        if (sourceWindow) liveControlsRegistry.setWindowChannel(sourceWindow, activateChannel);
        // Only sync state if activate is for a channel we care about
        if (activeChannels.includes(activateChannel)) {
          setState(liveControlsRegistry.getMergedState(activeChannels));
        }
        return;
      }

      const channel = liveControlsRegistry.resolveChannel(data.payload?.channel, sourceWindow || undefined);

      // Always register data in the singleton registry - other hook instances may need it
      if (data.type === BROADCAST_READY_KEY) {
        if (!sourceWindow) return;
        liveControlsRegistry.register(channel, sourceWindow, data.payload.timestamp);

        liveControlsRegistry.registerReadyState(
          channel,
          data.payload.controls,
          data.payload.values,
          data.payload.timestamp,
          sourceWindow
        );
      }

      if (data.type === BROADCAST_UPDATE_KEY) {
        liveControlsRegistry.updateValue(channel, data.payload.key, data.payload.value);
      }

      if (data.type === BROADCAST_DESTROY_KEY) {
        if (!sourceWindow) return;
        liveControlsRegistry.unregister(channel, sourceWindow);
      }

      // Only update this hook's state if the channel matches what we're listening for
      if (activeChannels.includes(channel)) {
        setState(liveControlsRegistry.getMergedState(activeChannels));
      }
    },
    [activeChannels, liveControlsRegistry]
  );

  useEffect(() => {
    window.addEventListener('message', onEvent);
    return () => window.removeEventListener('message', onEvent);
  }, [onEvent]);

  // Sync state when activeChannels change - registry may already have data for new channels
  useEffect(() => {
    setState(liveControlsRegistry.getMergedState(activeChannels));
  }, [activeChannels]);

  const onChange = useCallback(
    (key: string, value: any) => {
      liveControlsRegistry.broadcastUpdateToChannels(activeChannels, key, value);
    },
    [activeChannels, liveControlsRegistry]
  );

  const setTimestamp = useCallback(
    (ts: number) => {
      if (ts === 0) {
        liveControlsRegistry.resetTimestamps(activeChannels);
        setState(liveControlsRegistry.getMergedState(activeChannels));
      }
    },
    [activeChannels, liveControlsRegistry]
  );

  return {
    defs: state.defs,
    values: state.values,
    ready: state.ready,
    hasLiveControls,
    onChange,
    setTimestamp,
  };
}
