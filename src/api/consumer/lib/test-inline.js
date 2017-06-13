/** @flow */
import { loadConsumer } from '../../../consumer';
import InlineId from '../../../consumer/bit-inline-id';
import Bit from '../../../consumer/component';

export function testInline(id: string, verbose: boolean): Promise<Bit> {
  return loadConsumer()
    .then(consumer =>
      consumer.runComponentSpecs(InlineId.parse(id), verbose)
    );
}

export function testInlineAll(verbose: boolean): Promise<Bit> {
  return loadConsumer()
    .then(consumer =>
      consumer.runAllInlineSpecs(verbose)
    );
}
