import { Slot, SlotRegistry } from '@teambit/harmony';
import { MainRuntime } from '@teambit/cli';
import { Remotes } from '@teambit/legacy/dist/remotes';
import { GlobalRemotes } from '@teambit/legacy/dist/global-config';
import { ComponentID } from '@teambit/component-id';
import { RemoteScopeAspect } from './remote-scope.aspect';
import { BitObjectList } from '../../../src/scope/objects/bit-object-list';
import {
  multipleStreamsToBitObjects,
  groupByScopeName,
} from '../../../src/scope/component-ops/scope-components-importer';

type RemotesList = { [remoteName: string]: string };
type AddRemotesSlot = SlotRegistry<RemotesList>;

export class RemoteScopeMain {
  constructor(private addRemotesSlot: AddRemotesSlot) {}
  /**
   * get a single component from a remote without saving it locally
   */
  async getRemoteComponent(ids: ComponentID[]): Promise<BitObjectList | null | undefined> {
    const remotes = await this.getScopeRemotes();
    const bitIds = ids.map((id) => id._legacy);
    let bitObjectsList: BitObjectList;
    try {
      const streams = await remotes.fetch(groupByScopeName(bitIds));
      bitObjectsList = await multipleStreamsToBitObjects(Object.values(streams));
    } catch (err: any) {
      return null; // probably doesn't exist
    }

    return bitObjectsList;
  }

  async getScopeRemotes(): Promise<Remotes> {
    const globalRemotes = await GlobalRemotes.load();
    const globalObj = globalRemotes.toPlainObject();
    const registeredRemotesArray = this.addRemotesSlot.values();
    const registeredRemotes = registeredRemotesArray.reduce((acc, current) => ({ ...acc, ...current }), {});

    return Remotes.load({ ...globalObj, ...registeredRemotes });
  }

  registerRemotes(remotes: RemotesList) {
    this.addRemotesSlot.register(remotes);
  }

  static slots = [Slot.withType<RemotesList>()];
  static dependencies = [];
  static runtime = MainRuntime;
  static async provider(deps, config, [addRemotesSlot]: [AddRemotesSlot]) {
    return new RemoteScopeMain(addRemotesSlot);
  }
}

RemoteScopeAspect.addRuntime(RemoteScopeMain);
