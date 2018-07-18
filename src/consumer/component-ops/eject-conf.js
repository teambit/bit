// @flow
import { Consumer } from '..';

export type EjectConfResult = { id: string, ejectedPath: string };

export default (function attachEnvs(
  consumer: Consumer,
  id: string,
  { ejectPath }: { ejectPath: string }
): EjectConfResult {
  return { id, ejectedPath: 'some fake path' };
});
