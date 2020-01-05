import { Workspace } from '../workspace';
import { Scope } from '../scope/scope.api';
import { loadConsumer } from '../consumer';
import { Harmony } from '../harmony';

export default class Bit {
  constructor(private scope: Scope, private workspace: Workspace | null) {}

  // /**
  //  * loads Bit's API
  //  */
  // static async load(harmony: Harmony): Promise<Bit> {
  //   try {
  //     const consumer = await loadConsumer();
  //     const workspace = await Workspace.load();

  //     return new Bit(consumer.scope, workspace, harmony);
  //   } catch {
  //     return new Bit(await loadScope(), null, harmony);
  //   }
  // }
}
