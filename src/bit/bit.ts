import { Workspace } from '../workspace';
import { Scope, loadScope } from '../scope';
import { loadConsumer } from '../consumer';
import { Harmony } from '../harmony';

export default class Bit {
  constructor(private scope: Scope, private workspace: Workspace | null, private harmony: Harmony) {}

  /**
   * loads Bit
   */
  static async load(harmony: Harmony): Promise<Bit> {
    try {
      const consumer = await loadConsumer();
      return new Bit(consumer.scope, await Workspace.load(), harmony);
    } catch {
      return new Bit(await loadScope(), null, harmony);
    }
  }
}
