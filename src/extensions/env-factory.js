// @flow
import { COMPILER_ENV_TYPE, TESTER_ENV_TYPE } from '../constants';
import logger from '../logger/logger';
import TesterExtension from './tester-extension';
import CompilerExtension from './compiler-extension';
import EnvExtension from './env-extension';
import type { EnvLoadArgsProps, EnvExtensionProps } from './env-extension';

export default (async function makeEnv(envType: string, props: EnvLoadArgsProps): Promise<EnvExtension> {
  logger.debug(`env-factory, create ${envType}`);
  props.envType = envType;
  props.throws = true;
  const envExtensionProps: EnvExtensionProps = await EnvExtension.load(props);
  const extension = getEnvInstance(envType, envExtensionProps);
  if (extension.loaded) {
    const throws = true;
    await extension.init(throws);
  }
  return extension;
});

function getEnvInstance(envType: string, envExtensionProps: EnvExtensionProps): EnvExtension {
  switch (envType) {
    case COMPILER_ENV_TYPE:
      return new CompilerExtension(envExtensionProps);
    case TESTER_ENV_TYPE:
      return new TesterExtension(envExtensionProps);
    default:
      throw new Error(`unrecognized env type ${envType}`);
  }
}
