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
        return component.build({ scope: consumer.scope, consumer })
        .then(() => {
          const bitPath = inlineId.composeBitPath(consumer.getPath());
          const saveImplDist = component.dist ?
          component.dist.write(bitPath, component.implFile) : null;

          const saveSpecDist = component.specDist ?
          component.specDist.write(bitPath, component.specsFile) : null;

          return Promise.all([saveImplDist, saveSpecDist]);
        });
      });
    });
}
