/** @flow */
import { loadConsumer } from '../../../consumer';
import Component from '../../../consumer/component';
import { BitId } from '../../../bit-id';

export default function create(
  id: string,
  withSpecs: boolean,
  withBitJson: boolean, force: boolean
  ): Promise<Component> {
  return loadConsumer()
    .then(consumer =>
      consumer.createComponent({ id: BitId.parse(id), withSpecs, withBitJson, force })
    );
}
