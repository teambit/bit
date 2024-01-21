import { PnpmError } from '@pnpm/error';
import { expect } from 'chai';
import { pnpmErrorToBitError } from './pnpm-error-to-bit-error';

it('the hint from the fetch error is used', () => {
  const bitError = pnpmErrorToBitError(
    new PnpmError('FETCH_404', 'GET https://node-registry.bit.cloud/dsffsdf: Not Found - 404', {
      hint: `dsffsdf is not in the npm registry, or you have no permission to fetch it.

An authorization header was used: Bearer df96[hidden]`,
    })
  );
  expect(bitError.report()).to.equal(`GET https://node-registry.bit.cloud/dsffsdf: Not Found - 404

dsffsdf is not in the npm registry, or you have no permission to fetch it.

An authorization header was used: Bearer df96[hidden]`);
});

it('a regular error object is reported', () => {
  const bitError = pnpmErrorToBitError(new Error('some error') as any);
  expect(bitError.report()).to.equal('some error');
});
