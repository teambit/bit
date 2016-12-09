/** @flow */
import { loadConsumer } from '../../consumer';

export default function list({ inline }: any): Promise<string[]> {
  return loadConsumer().then(box => 
    box.list({ inline })
  );
}
