import * as globalConfig from '../../api/consumer/lib/global-config';
import { CFG_INTERACTIVE } from '../../constants';

export default function shouldShowInteractive(commandConfigName: string): boolean {
  const specificCommandConfig = globalConfig.getSync(commandConfigName);
  // we use (specificCommandConfig !== 'false') rather than (specificCommandConfig === 'true') to make it true in case of
  // wrong value
  if (specificCommandConfig !== undefined) return specificCommandConfig !== 'false';
  const generalInteractiveConfig = globalConfig.getSync(CFG_INTERACTIVE);
  if (generalInteractiveConfig !== undefined) return generalInteractiveConfig !== 'false';
  // Default is to show interactive
  return true;
}
