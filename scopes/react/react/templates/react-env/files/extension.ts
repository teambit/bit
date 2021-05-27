import { ComponentContext } from '@teambit/generator';
import { MainFileContents } from '../../common/common-env-main';

export function extensionFile(context: ComponentContext) {
  return MainFileContents(context);
}
