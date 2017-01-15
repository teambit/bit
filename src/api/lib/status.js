/** @flow */
import { loadConsumer } from '../../consumer';
import Component from '../../consumer/bit-component';

export type StatusRes = {
  name: string,
  valid: boolean,
}

export default function status(): Promise<{ inline: Component[], sources: Component[]}> {
  return loadConsumer()
  .then(consumer => Promise.all([consumer.listInline(), consumer.scope.listStage()]))
  .then(([inline, sources]) => ({ inline, sources }));
}
