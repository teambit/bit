/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import InlineId from '../../../consumer/bit-inline-id';
import { ComponentDependencies } from '../../../scope';

export default function modify({ id, loader }: { id: string, loader: any }) {
  return loadConsumer()
    .then((consumer) => {
      const bitId = BitId.parse(id, consumer.scope.name);
      loader.start();

      return consumer.scope.modify(bitId)
      .then((c: ComponentDependencies) => {
        const inlineId = new InlineId({ box: bitId.box, name: bitId.name });
        const inlineBitPath = inlineId.composeBitPath(consumer.getPath());

        return c.component.write(inlineBitPath, true)
          .then((component) => {    
            loader.stop();
            
            return consumer.scope.ensureEnvironment({ 
              testerId: component.testerId, compilerId: component.compilerId
            })
            .then(() => component);
          });
      });
    });
}
