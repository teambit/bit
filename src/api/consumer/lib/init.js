/** @flow */
import { Consumer } from '../../../consumer';

export default (async function init(
  absPath: string = process.cwd(),
  noGit: boolean = false,
  reset: boolean = false,
  resetHard: boolean = false
): Promise<Consumer> {
  if (reset || resetHard) {
    await Consumer.reset(absPath, resetHard, noGit);
  }
  const consumer: Consumer = await Consumer.create(absPath, noGit);
  return consumer.write();
});
