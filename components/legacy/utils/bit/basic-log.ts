import * as globalConfig from '@teambit/legacy/dist/api/consumer/lib/global-config';
import { CFG_USER_EMAIL_KEY, CFG_USER_NAME_KEY } from '@teambit/legacy/dist/constants';
import { Log } from '@teambit/legacy/dist/scope/models/version';
import { getBitCloudUser } from './get-cloud-user';

export async function getBasicLog(): Promise<Log> {
  const username = (await getBitCloudUsername()) || (await globalConfig.get(CFG_USER_NAME_KEY));
  const email = await globalConfig.get(CFG_USER_EMAIL_KEY);
  return {
    username,
    email,
    message: '',
    date: Date.now().toString(),
  };
}

async function getBitCloudUsername() {
  const user = await getBitCloudUser();
  return user?.username;
}
