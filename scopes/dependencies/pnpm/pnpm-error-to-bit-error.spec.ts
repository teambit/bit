import PnpmError from '@pnpm/error';
import { pnpmErrorToBitError } from './pnpm-error-to-bit-error';

test('the hint from the fetch error is used', () => {
  const bitError = pnpmErrorToBitError(
    new PnpmError('FETCH_404', 'GET https://node.bit.cloud/dsffsdf: Not Found - 404', {
      hint: `dsffsdf is not in the npm registry, or you have no permission to fetch it.

An authorization header was used: Bearer df96[hidden]`,
    })
  );
  expect(bitError.report()).toEqual(`GET https://node.bit.cloud/dsffsdf: Not Found - 404

dsffsdf is not in the npm registry, or you have no permission to fetch it.

An authorization header was used: Bearer df96[hidden]`);
});

test('a regular error object is reported', () => {
  const bitError = pnpmErrorToBitError(new Error('some error') as any);
  expect(bitError.report()).toEqual('some error');
});
