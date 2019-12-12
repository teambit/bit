import * as globalConfig from '../../api/consumer/lib/global-config';
import { CFG_INTERACTIVE } from '../../constants';

export default function shouldShowInteractive(commandConfigName: string): boolean {
  const specificCommandConfig = globalConfig.getSync(commandConfigName);
  // the value in the config is string so we need to compare it to string
  // we use specificCommandConfig === 'true' to make it false in case of wrong value
  if (specificCommandConfig !== undefined) return specificCommandConfig === 'true';
  const generalInteractiveConfig = globalConfig.getSync(CFG_INTERACTIVE);
  if (generalInteractiveConfig !== undefined) return generalInteractiveConfig === 'true';
  // Default is to not show interactive
  return false;
}
