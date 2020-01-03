import { Workspace } from '../workspace';
import { Scope, loadScope } from '../scope';
import { loadConsumer } from '../consumer';
import { Harmony } from '../harmony';
import loadExtensions from './load-extensions';

export default class Bit {
  constructor(private scope: Scope, private workspace: Workspace | null, private harmony: Harmony) {}

  /**
   * loads Bit's API
   */
  static async load(harmony?: Harmony): Promise<Bit> {
    if (!harmony) harmony = Harmony.load();

    try {
      const consumer = await loadConsumer();
      const workspace = await Workspace.load();
      loadExtensions(workspace);

      return new Bit(consumer.scope, workspace, harmony);
    } catch {
      return new Bit(await loadScope(), null, harmony);
    }
  }
}
