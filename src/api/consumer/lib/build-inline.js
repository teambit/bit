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
        return component.build({ scope: consumer.scope })
        .then(() => {
          const bitPath = inlineId.composeBitPath(consumer.getPath());
          return component.dist ? component.dist.write(bitPath) : null;
        });
      });
    });
}
