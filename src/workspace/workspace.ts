import { loadConsumer, Consumer } from '../consumer';

/**
 * API of the Bit Workspace
 */
export default class Workspace {
  constructor(private consumer: Consumer) {}

  static async load(): Promise<Workspace> {
    const consumer = await loadConsumer();
    return new Workspace(consumer);
  }
}
