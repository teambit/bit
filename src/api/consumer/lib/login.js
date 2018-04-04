/** @flow */
import loginToBitSrc from '../../../consumer/login/login';

export default (async function loginAction(addProps: AddProps): Promise<AddActionResults> {
  return loginToBitSrc();
});
