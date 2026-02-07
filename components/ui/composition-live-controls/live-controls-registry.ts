/* eslint-disable no-console */
import { type Control } from './composition-live-controls';

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

const DEBUG = false;
const debug = (...args: any[]) => {
  if (DEBUG) console.debug('[LiveControlsRegistry]', ...args);
};

/**
 * Low-level registry for live controls channel state.
 * Manages channel subscriptions, state storage, and broadcasts.
 * Does not contain any diff-specific logic - that belongs in DiffControlsModel.
 */
export class LiveControlsRegistry {
  private static _instance: LiveControlsRegistry | undefined;

  static getInstance() {
    if (!this._instance) {
      this._instance = new LiveControlsRegistry();
    }
    return this._instance;
  }

  private channels = new Map<ChannelName, LiveControlsSubscriber[]>();
  private state = new Map<ChannelName, ChannelState>();
  readonly DEFAULT_CHANNEL = 'default';

  normalizeChannel(channel?: ChannelName): ChannelName {
    return channel || this.DEFAULT_CHANNEL;
  }

  getChannelNames(): ChannelName[] {
    return Array.from(new Set([...this.channels.keys(), ...this.state.keys()]));
  }

  private ensureState(key: ChannelName): ChannelState {
    if (!this.state.has(key)) {
      this.state.set(key, { defs: [], values: {}, ready: false, timestamps: new Map() });
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
    const key = this.normalizeChannel(channel);
    debug('register', { channel, key, timestamp });

    const list = this.ensureSubscribers(key);
    if (!list.find((s) => s.iframeWindow === iframeWindow)) {
      list.push({ iframeWindow, timestamp });
    }

    const st = this.ensureState(key);
    st.timestamps.set(iframeWindow, timestamp);
  }

  unregister(channel: ChannelName, iframeWindow: Window) {
    const key = this.normalizeChannel(channel);
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
      if (st.timestamps.size === 0) st.ready = false;
    }
  }

  getSubscribers(channel?: ChannelName): LiveControlsSubscriber[] {
    return this.channels.get(this.normalizeChannel(channel)) || [];
  }

  get hasAnySubscribers(): boolean {
    return [...this.channels.values()].some((list) => list.length > 0);
  }

  registerReadyState(channel: ChannelName, defs: any[], values: Record<string, any>, timestamp: number, win: Window) {
    const key = this.normalizeChannel(channel);
    debug('registerReadyState', { channel, key, defsCount: defs.length, timestamp });

    const st = this.ensureState(key);
    st.timestamps.set(win, timestamp);
    st.defs = defs.length ? defs : st.defs;
    st.values = { ...st.values, ...values };
    st.ready = st.timestamps.size > 0;
    this.state.set(key, st);
  }

  updateValue(channel: ChannelName, key: string, value: any) {
    const st = this.state.get(this.normalizeChannel(channel));
    if (st) st.values[key] = value;
  }

  getState(channel?: ChannelName): ChannelState | undefined {
    return this.state.get(this.normalizeChannel(channel));
  }

  broadcastUpdate(channel: ChannelName, key: string, value: any) {
    const normalizedChannel = this.normalizeChannel(channel);
    const subs = this.getSubscribers(normalizedChannel);

    subs.forEach((sub) => {
      try {
        sub.iframeWindow.postMessage(
          {
            type: 'composition-live-controls:update',
            payload: { channel: normalizedChannel, key, value },
          },
          '*'
        );
      } catch (err) {
        console.error('broadcast failed', err);
      }
    });
  }

  resetChannel(channel: ChannelName) {
    const key = this.normalizeChannel(channel);
    const st = this.state.get(key);
    if (!st) return;
    st.timestamps.clear();
    st.ready = false;
    st.defs = [];
    st.values = {};
  }

  // ---- Multi-channel utilities ----

  /**
   * Merge state from multiple channels into a single result.
   * Used by useLiveControls hook to aggregate multiple channels.
   */
  getMergedState(channels: string[]) {
    const defsMap: Record<string, any> = {};
    const values: Record<string, any> = {};
    let ready = false;

    channels
      .map((ch) => this.normalizeChannel(ch))
      .forEach((ch) => {
        const s = this.state.get(ch);
        if (!s) return;
        s.defs.forEach((d) => {
          defsMap[d.id] = d;
        });
        Object.assign(values, s.values);
        if (s.ready) ready = true;
      });

    return { defs: Object.values(defsMap), values, ready };
  }

  /**
   * Broadcast an update to multiple channels.
   */
  broadcastUpdateToChannels(channels: string[], key: string, value: any) {
    const uniqueChannels = [...new Set(channels.map((ch) => this.normalizeChannel(ch)))];
    uniqueChannels.forEach((ch) => this.broadcastUpdate(ch, key, value));
  }

  /**
   * Reset multiple channels at once.
   */
  resetTimestamps(channels: string[]) {
    const uniqueChannels = [...new Set(channels.map((ch) => this.normalizeChannel(ch)))];
    uniqueChannels.forEach((ch) => this.resetChannel(ch));
  }

  cleanupAll() {
    this.channels.clear();
    this.state.clear();
  }
}
