import { CFG_REGISTRY_DOMAIN_PREFIX, DEFAULT_REGISTRY_DOMAIN_PREFIX } from '../../constants';
import { getSync } from '../../api/consumer/lib/global-config';

export default function npmRegistryName(): string {
  return getSync(CFG_REGISTRY_DOMAIN_PREFIX) || DEFAULT_REGISTRY_DOMAIN_PREFIX;
}
