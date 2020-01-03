import { Workspace } from '../workspace';
import { Scope, loadScope } from '../scope';
import { loadConsumer } from '../consumer';
import { buildRegistry, CommandRegistry } from '../cli';
import { Harmony } from '../harmony';

export default class Bit {
  constructor(
    private scope: Scope,
    private workspace: Workspace | null,
    private cmdRegistry: CommandRegistry,
    private harmony: Harmony
  ) {}

  static async load(): Promise<Bit> {
    const harmony = Harmony.load();
    const cmdRegistry = buildRegistry([]);

    try {
      cmdRegistry.run();
    } catch (err) {
      console.error('loud rejected:', err); // eslint-disable-line no-console
    }

    try {
      const consumer = await loadConsumer();
      return new Bit(consumer.scope, await Workspace.load(), cmdRegistry, harmony);
    } catch {
      return new Bit(await loadScope(), null, cmdRegistry, harmony);
    }
  }
}
