/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import InlineId from '../../../consumer/bit-inline-id';
import { ComponentDependencies } from '../../../scope';
import loader from '../../../cli/loader';
import { BEFORE_MODIFY_ACTION } from '../../../cli/loader/loader-messages';

export default function modify({ id, no_env, verbose }: {
  id: string, no_env?: bool, verbose: true }) {
  return loadConsumer()
    .then((consumer) => {
      const bitId = BitId.parse(id, consumer.scope.name);
      loader.start(BEFORE_MODIFY_ACTION);

      return consumer.scope.modify({ bitId, consumer, no_env, verbose })
      .then((c: ComponentDependencies) => {
        const inlineId = new InlineId({ box: bitId.box, name: bitId.name });
        const inlineBitPath = inlineId.composeBitPath(consumer.getPath());
        return c.component.write(inlineBitPath, true)
          .then(component => consumer.driver.runHook('onModify', { component }, component));
      });
    });
}
