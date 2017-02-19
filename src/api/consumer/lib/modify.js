/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import InlineId from '../../../consumer/bit-inline-id';
import { ComponentDependencies } from '../../../scope';
import loader from '../../../cli/loader';

export default function modify({ id }: { id: string }) {
  return loadConsumer()
    .then((consumer) => {
      const bitId = BitId.parse(id, consumer.scope.name);
      loader.start();

      return consumer.scope.modify(bitId)
      .then((c: ComponentDependencies) => {
        const inlineId = new InlineId({ box: bitId.box, name: bitId.name });
        const inlineBitPath = inlineId.composeBitPath(consumer.getPath());

        return c.component.write(inlineBitPath, true);
      });
    });
}
