import ScopeAspect, { ScopeMain } from '@teambit/scope';
import { Slot, SlotRegistry } from '@teambit/harmony';
import pMapSeries from 'p-map-series';
import { MainRuntime } from '@teambit/cli';
import path from 'path';
import fs from 'fs-extra';
import { IpcEventsAspect } from './ipc-events.aspect';

type EventName = 'onPostInstall';

type GotEvent = (eventName: EventName) => Promise<void>;
type GotEventSlot = SlotRegistry<GotEvent>;

const EVENTS_DIR = 'events';

/**
 * imagine you have multiple processes running in the background, such as `bit watch`, `bit start`, `bit server`.
 * the user is running `bit install` from the cli, how do you let these processes know that the installation is complete?
 * `bit start` for instance could use ths info to clear the "component issues" of the components that were missing packages.
 *
 * this class provides a mechanism to achieve this by writing the event into the filesystem (`.bit/events/event-name`),
 * while each one of the processes has a watcher in the background watch this file. once they got the data from the watcher,
 * they can act upon it.
 *
 * in the previous example, when the user is running `bit install`, the install aspect runs `this.publishIpcEvent` to
 * write `.bit/events/onPostInstall` to the filesystem. then, the watcher of `bit start` process got a notification
 * that this file has changed/added and it runs `triggerGotEvent` to run all aspects registered to its gotEventSlot.
 * the installer in turn is registered to this slot and once its function is triggered, it check whether the eventName
 * is onPostInstall and then triggers its own OnPostInstall slot.
 */
export class IpcEventsMain {
  constructor(private scope: ScopeMain, private gotEventSlot: GotEventSlot) {}

  registerGotEventSlot(fn: GotEvent) {
    this.gotEventSlot.register(fn);
  }

  async triggerGotEvent(eventName: EventName) {
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

  get eventsDir() {
    return path.join(this.scope.path, EVENTS_DIR);
  }

  static slots = [Slot.withType<GotEventSlot>()];
  static dependencies = [ScopeAspect];
  static runtime = MainRuntime;

  static async provider([scope]: [ScopeMain], _, [gotEventSlot]: [GotEventSlot]) {
    return new IpcEventsMain(scope, gotEventSlot);
  }
}

IpcEventsAspect.addRuntime(IpcEventsMain);

export default IpcEventsMain;
