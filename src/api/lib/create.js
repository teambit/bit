/** @flow */
import { loadConsumer } from '../../consumer';
import InlineId from '../../consumer/bit-inline-id';
import Component from '../../consumer/bit-component';

export default function create(id: string, withSpecs: boolean, withBitJson: boolean):
Promise<Component> {
  return loadConsumer()
    .then(consumer =>
      consumer.createBit({ id: InlineId.parse(id), withSpecs, withBitJson })
      // .then((component) => {
      //   return consumer.scope.ensureEnvironment({
      //     testerId: component.testerId, compilerId: component.compilerId
      //   })
      // .then(() => component)
    );
}
