import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import pMapSeries from 'p-map-series';
import { MainRuntime } from '@teambit/cli';
import path from 'path';
import fs from 'fs-extra';
import { IpcEventsAspect } from './ipc-events.aspect';

type EventName = 'onPostInstall' | 'onPostObjectsPersist' | 'onNotifySSE';

type GotEvent = (eventName: EventName) => Promise<void>;
type GotEventSlot = SlotRegistry<GotEvent>;

const EVENTS_DIR = 'events';

/**
 * You might have several processes running in the background (for example, bit watch, bit start, or bit server).
 * When the user runs `bit install`, these processes need to be notified that the installation has completed. One reason
 * is that "bit start" in the workspace could remove component-issues related to missing dependencies.
 *
 * To achieve this, an event file is written to the filesystem (e.g., .bit/events/<event-name>), and each background
 * process has a file watcher monitoring these event files. When an event file is created or updated, they can act upon it.
 *
 * For instance, when the user runs bit install, the “install” aspect calls publishIpcEvent, which writes
 * `.bit/events/onPostInstall`. The "bit start" process (along with others) detects the file change and invokes
 * `ipcEvents.triggerGotEvent()`. Any aspect subscribed to the gotEventSlot then runs its logic. In this example, the
 * installer aspect is subscribed, so when it recognizes the onPostInstall event, it triggers its own OnPostInstall slot.
 *
 * @see ./example-diagram.md for a visual representation of the above.
 */
export class IpcEventsMain {
  constructor(
    private scope: ScopeMain,
    private gotEventSlot: GotEventSlot,
    private logger: Logger
  ) {}

  registerGotEventSlot(fn: GotEvent) {
    this.gotEventSlot.register(fn);
  }

  /**
   * this gets called from the watcher only.
   * as soon as the watcher finds out that a new event has been written to the filesystem, it triggers this function
   */
  async triggerGotEvent(eventName: EventName) {
    this.logger.info(`triggering got event ${eventName}`);
    await pMapSeries(this.gotEventSlot.values(), (fn) => fn(eventName));
  }

  /**
   * write event data into the filesystem, so then other processes, such as "bit start", "bit watch", could use the
   * watcher to get the event data.
   */
  async publishIpcEvent(eventName: EventName, data?: Record<string, any>) {
    const filename = path.join(this.eventsDir, eventName);
    const content = data ? JSON.stringify(data, undefined, 2) : '';
    await fs.outputFile(filename, content);
  }

  /**
   * This is helpful when all we want is to notify the watchers that a new event has been written to the filesystem.
   * It doesn't require the watchers to register to GotEventSlot. The watchers always listen to this onNotifySSE event,
   * and once they get it, they simply send a server-send-event to the clients.
   */
  async publishIpcOnNotifySseEvent(event: string, data?: Record<string, any>) {
    await this.publishIpcEvent('onNotifySSE', { event, data });
  }

  get eventsDir() {
    return path.join(this.scope.path, EVENTS_DIR);
  }

  static slots = [Slot.withType<GotEventSlot>()];
  static dependencies = [ScopeAspect, LoggerAspect];
  static runtime = MainRuntime;

  static async provider([scope, loggerMain]: [ScopeMain, LoggerMain], _, [gotEventSlot]: [GotEventSlot]) {
    const logger = loggerMain.createLogger(IpcEventsAspect.id);
    const ipcEventsMain = new IpcEventsMain(scope, gotEventSlot, logger);

    if (scope) {
      // in case commands like "bit export" are running from the cli, long-running processes should clear their cache.
      // otherwise, objects like "ModelComponent" are out-of-date and could have the wrong head and the "state"/"local" data.
      scope.registerOnPostObjectsPersist(async () => {
        await ipcEventsMain.publishIpcEvent('onPostObjectsPersist');
      });
      ipcEventsMain.registerGotEventSlot(async (eventName) => {
        if (eventName === 'onPostObjectsPersist') {
          logger.debug('got an event onPostObjectsPersist, clearing the cache and reloading staged-snaps');
          scope.legacyScope.objects.clearObjectsFromCache();
          scope.legacyScope.setStagedSnaps(); // "bit export" deletes the staged-snaps file, so it should be reloaded
        }
      });
    }

    return ipcEventsMain;
  }
}

IpcEventsAspect.addRuntime(IpcEventsMain);

export default IpcEventsMain;
