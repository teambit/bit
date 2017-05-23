import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import InlineId from '../../../consumer/bit-inline-id';
import loader from '../../../cli/loader';
import { ComponentDependencies } from '../../../scope';
import { BEFORE_RESET_ACTION } from '../../../cli/loader/loader-messages';

export default function reset({ id }: { id: string }) {
  return loadConsumer()
    .then((consumer) => {
      const bitId = BitId.parse(id, consumer.scope.name);
      loader.start(BEFORE_RESET_ACTION);
      return consumer.scope.reset({ bitId, consumer })
        .then((c: ComponentDependencies) => {
          const inlineId = new InlineId({ box: bitId.box, name: bitId.name });
          const inlineBitPath = inlineId.composeBitPath(consumer.getPath());
          return c.component.write(inlineBitPath, true)
            .then(component => consumer.driver.runHook('onModify', { component }, component));
        });
    });
}
