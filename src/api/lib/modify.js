/** @flow */
import * as pathLib from 'path';
import { loadConsumer } from '../../consumer';
import { BitId } from '../../bit-id';
import InlineId from '../../consumer/bit-inline-id';
import ConsumerComponent from '../../consumer/component';
import { ComponentDependencies } from '../../scope';

export default function modify(rawId: string) {
  const bitId = BitId.parse(rawId);
  return loadConsumer()
    .then(consumer => 
      consumer.scope.get(bitId)
      .then((c: ComponentDependencies) => {
        const inlineId = new InlineId({ box: bitId.box, name: bitId.name });
        const inlineBitPath = inlineId.composeBitPath(consumer.getPath());
        
        return c.component.write(inlineBitPath)
          .then((component) => {
            return consumer.scope.ensureEnvironment({ 
              testerId: component.testerId, compilerId: component.compilerId
            })
            .then(() => component);
          });
      })
    );
}
