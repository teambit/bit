/** @flow */
import { loadConsumer } from '../../../consumer';
import Bit from '../../../consumer/component';
import InlineId from '../../../consumer/bit-inline-id';

export default function build({ id }: { id: string }): Promise<Bit> {
  // return loadConsumer() // @DEPRECATED
  //   .then((consumer) => {
  //     return consumer.loadComponent(InlineId.parse(id))
  //     .then((component) => { 
  //       return component.build(consumer.scope).then((val) => {
  //         if (val) console.log(val.code);
  //         else console.error('build has failed, probably no compiler');
  //       });
  //     });
  //   });
}
