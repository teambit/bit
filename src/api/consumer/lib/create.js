/** @flow */
import { loadConsumer } from '../../../consumer';
import InlineId from '../../../consumer/bit-inline-id';
import Component from '../../../consumer/component';

export default function create(id: string, withSpecs: boolean, withBitJson: boolean, force: boolean):
Promise<Component> {
  return loadConsumer()
    .then(consumer =>
      consumer.createBit({ id: InlineId.parse(id), withSpecs, withBitJson, force })
    );
}
