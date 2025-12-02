import { WatcherAspect } from './watcher.aspect';

export type { WatchOptions } from './watcher';
export { CheckTypes } from './check-types';
export type { WatcherMain } from './watcher.main.runtime';
export { WatcherDaemon, WatcherClient, getOrCreateWatcherConnection } from './watcher-daemon';
export type { WatcherEvent, WatcherError, WatcherHeartbeat, WatcherReady, WatcherMessage } from './watcher-daemon';
export default WatcherAspect;
export { WatcherAspect };
