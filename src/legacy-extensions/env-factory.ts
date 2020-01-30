import { COMPILER_ENV_TYPE, TESTER_ENV_TYPE } from '../constants';
import logger from '../logger/logger';
import TesterExtension from './tester-extension';
import CompilerExtension from './compiler-extension';
import EnvExtension from './env-extension';
import { EnvType, EnvLoadArgsProps, EnvExtensionProps } from './env-extension-types';
import BaseExtension from './base-extension';
import { BaseExtensionModel } from './base-extension';
import Repository from '../scope/objects/repository';

export default (async function makeEnv(envType: EnvType, props: EnvLoadArgsProps): Promise<EnvExtension> {
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

export async function makeEnvFromModel(
  envType: EnvType,
  modelObject: string | BaseExtensionModel,
  repository: Repository
): Promise<EnvExtension | null | undefined> {
  logger.debug(`env-factory, create ${envType} from model`);
  if (!modelObject) return undefined;
  const actualObject =
    typeof modelObject === 'string'
      ? { envType, ...BaseExtension.transformStringToModelObject(modelObject) }
      : { envType, ...modelObject };
  const envExtensionProps: EnvExtensionProps = await EnvExtension.loadFromModelObject(actualObject, repository);
  const extension = getEnvInstance(envType, envExtensionProps);
  return extension;
}

function getEnvInstance(envType: EnvType, envExtensionProps: EnvExtensionProps): EnvExtension {
  switch (envType) {
    case COMPILER_ENV_TYPE:
      return new CompilerExtension(envExtensionProps);
    case TESTER_ENV_TYPE:
      return new TesterExtension(envExtensionProps);
    default:
      throw new Error(`unrecognized env type ${envType}`);
  }
}
