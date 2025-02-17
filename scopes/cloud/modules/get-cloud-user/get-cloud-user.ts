import { CloudUser } from '@teambit/cloud.models.cloud-user';
import { CFG_USER_TOKEN_KEY, getCloudDomain } from '@teambit/legacy.constants';
import { fetchWithAgent as fetch } from '@teambit/scope.network';
import { getConfig } from '@teambit/config-store';

export async function getBitCloudUser(): Promise<CloudUser | undefined> {
  const token = getConfig(CFG_USER_TOKEN_KEY);
  if (!token) return undefined;

  try {
    const res = await fetch(`https://api.${getCloudDomain()}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const object = await res.json();
    const user = object.payload;

    return user;
  } catch {
    return undefined;
  }
}
