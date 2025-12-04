/* eslint-disable no-console */
import { Control } from './composition-live-controls';

export type ChannelName = string;

export type LiveControlsSubscriber = {
  iframeWindow: Window;
  timestamp: number;
};

export type ChannelState = {
  defs: Array<Control>;
  values: Record<string, any>;
  ready: boolean;
  timestamps: Map<Window, number>;
};

export class LiveControlsRegistry {
  private channels = new Map<ChannelName, LiveControlsSubscriber[]>();

  private state = new Map<ChannelName, ChannelState>();

  private readonly DEFAULT_CHANNEL = 'default';

  private normalize(channel?: ChannelName) {
    return channel || this.DEFAULT_CHANNEL;
  }

  private ensureState(key: ChannelName): ChannelState {
    if (!this.state.has(key)) {
      this.state.set(key, {
        defs: [],
        values: {},
        ready: false,
        timestamps: new Map(),
      });
    }
    return this.state.get(key)!;
  }

  private ensureSubscribers(key: ChannelName): LiveControlsSubscriber[] {
    if (!this.channels.has(key)) {
      this.channels.set(key, []);
    }
    return this.channels.get(key)!;
  }

  register(channel: ChannelName, iframeWindow: Window, timestamp: number) {
    const key = this.normalize(channel);

    const list = this.ensureSubscribers(key);
    if (!list.find((s) => s.iframeWindow === iframeWindow)) {
      list.push({ iframeWindow, timestamp });
    }

    const st = this.ensureState(key);
    st.timestamps.set(iframeWindow, timestamp);
  }

  unregister(channel: ChannelName, iframeWindow: Window) {
    const key = this.normalize(channel);

    const list = this.channels.get(key);
    if (list) {
      this.channels.set(
        key,
        list.filter((s) => s.iframeWindow !== iframeWindow)
      );
    }

    const st = this.state.get(key);
    if (st) {
      st.timestamps.delete(iframeWindow);
      if (st.timestamps.size === 0) {
        st.ready = false;
      }
    }
  }

  getSubscribers(channel?: ChannelName): LiveControlsSubscriber[] {
    const key = this.normalize(channel);
    return this.channels.get(key) || [];
  }

  registerReadyState(channel: ChannelName, defs: any[], values: Record<string, any>, timestamp: number, win: Window) {
    const key = this.normalize(channel);
    const st = this.ensureState(key);

    st.timestamps.set(win, timestamp);

    st.defs = defs.length ? defs : st.defs;
    st.values = { ...st.values, ...values };

    st.ready = st.timestamps.size > 0;

    this.state.set(key, st);
  }

  updateValue(channel: ChannelName, key: string, value: any) {
    const st = this.state.get(channel);
    if (!st) return;

    st.values[key] = value;
  }

  getState(channel: ChannelName): ChannelState | undefined {
    return this.state.get(channel);
  }

  getMergedState(channels: string[]) {
    const defsMap: Record<string, any> = {};
    const values: Record<string, any> = {};
    let ready = false;

    channels.forEach((ch) => {
      const s = this.state.get(ch);
      if (!s) return;

      s.defs.forEach((d) => {
        defsMap[d.id] = d;
      });

      Object.assign(values, s.values);

      if (s.ready) ready = true;
    });

    return {
      defs: Object.values(defsMap),
      values,
      ready,
    };
  }

  broadcastUpdate(channel: ChannelName, key: string, value: any) {
    const subs = this.getSubscribers(channel);
    subs.forEach((sub) => {
      try {
        sub.iframeWindow.postMessage(
          {
            type: 'composition-live-controls:update',
            payload: { channel, key, value },
          },
          '*'
        );
      } catch (err) {
        console.error('broadcast failed', err);
      }
    });
  }

  broadcastUpdateToChannels(channels: string[], key: string, value: any) {
    channels.forEach((ch) => {
      this.broadcastUpdate(ch, key, value);
    });
  }

  resetTimestamps(channels: string[]) {
    channels.forEach((ch) => {
      const st = this.state.get(ch);
      if (!st) return;

      st.timestamps.clear();
      st.ready = false;
      st.defs = [];
      st.values = {};
    });
  }

  cleanupAll() {
    this.channels.clear();
    this.state.clear();
  }
}

export const liveControlsRegistry = new LiveControlsRegistry();
