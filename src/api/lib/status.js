/** @flow */
import { loadConsumer } from '../../consumer';

export type StatusRes = {
  name: string,
  valid: boolean,
}

export default function status(): Promise<StatusRes[]> {
  return loadConsumer().then(consumer => 
    consumer.inline.list()
    .then(bitNameList => Promise.all(
      bitNameList.map(
        bitName => 
          consumer.get(bitName)
          .then(bit => ({ 
            name: bit.name,
            valid: !bit.validate()
          }))
        )
      ))
  );
}
