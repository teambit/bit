import Bit from './bit';
import { buildRegistry, CommandRegistry } from '../cli';
import { Harmony } from '../harmony';

export default class BitCli {
  constructor(private bit: Bit, private cmdRegistry: CommandRegistry, private harmony: Harmony) {}

  static async load(harmony: Harmony, bit?: Bit): Promise<BitCli> {
    const cmdRegistry = buildRegistry([]);

    try {
      cmdRegistry.run();
    } catch (err) {
      console.error('loud rejected:', err); // eslint-disable-line no-console
    }

    if (bit) return new BitCli(bit, cmdRegistry, harmony);
    return new BitCli(await Bit.load(harmony), cmdRegistry, harmony);
  }
}
