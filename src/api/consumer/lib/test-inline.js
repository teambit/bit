/** @flow */
import { loadConsumer } from '../../../consumer';
import InlineId from '../../../consumer/bit-inline-id';
import Bit from '../../../consumer/component';

export function testInline(id: string): Promise<Bit> {
  return loadConsumer()
    .then(consumer =>
      consumer.runComponentSpecs(InlineId.parse(id))
    );
}

export function testInlineAll(): Promise<Bit> {
  return loadConsumer()
    .then(consumer =>
      consumer.runAllInlineSpecs()
    );
}
