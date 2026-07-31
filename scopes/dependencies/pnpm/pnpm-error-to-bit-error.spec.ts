import { expect } from 'chai';
import { pnpmErrorToBitError } from './pnpm-error-to-bit-error';

// Build a PnpmError-like object without importing `@pnpm/error`, which is ESM
// and can trip up Babel/mocha when pulled into the test context.
function makePnpmError(code: string, message: string, hint?: string): any {
  const err: any = new Error(message);
  err.code = code.startsWith('ERR_PNPM_') ? code : `ERR_PNPM_${code}`;
  if (hint) err.hint = hint;
  return err;
}

it('the hint from the fetch error is used', () => {
  const bitError = pnpmErrorToBitError(
    makePnpmError(
      'FETCH_404',
      'GET https://node-registry.bit.cloud/dsffsdf: Not Found - 404',
      `dsffsdf is not in the npm registry, or you have no permission to fetch it.

An authorization header was used: Bearer df96[hidden]`
    )
  );
  expect(bitError.report()).to.equal(`GET https://node-registry.bit.cloud/dsffsdf: Not Found - 404

dsffsdf is not in the npm registry, or you have no permission to fetch it.

An authorization header was used: Bearer df96[hidden]`);
});

it('a regular error object is reported', () => {
  const bitError = pnpmErrorToBitError(new Error('some error') as any);
  expect(bitError.report()).to.equal('some error');
});
