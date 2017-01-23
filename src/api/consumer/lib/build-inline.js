/** @flow */
import { loadConsumer } from '../../../consumer';
import Bit from '../../../consumer/component';
import InlineId from '../../../consumer/bit-inline-id';

export default function build(id: string): Promise<Bit> {
  const inlineId = InlineId.parse(id);
  return loadConsumer()
    .then((consumer) => {
      return consumer.loadComponent(inlineId)
      .then((component) => { 
        component.build(consumer.scope);
        return component.writeBuild(
          inlineId.composeBitPath(consumer.getPath())
        );
      });
    });
}
