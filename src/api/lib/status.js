/** @flow */
import { loadConsumer } from '../../consumer';
import Bit from '../../bit';

export type StatusRes = {
  name: string,
  valid: boolean,
}

export default function status(): Promise<{ inline: Bit[], sources: Bit[]}> {
  return loadConsumer()
  .then(consumer => Promise.all([consumer.listInline(), consumer.scope.listSources()]))
  .then(([inline, sources]) => ({ inline, sources }));
}
