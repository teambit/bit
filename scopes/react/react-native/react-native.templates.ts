import { ComponentTemplate } from '@teambit/generator';
import {
  ReactNativeComponentTemplate,
  ReactNativeJSComponentTemplate,
  ReactNativeEnvTemplate,
} from '@teambit/react.generator.react-native-templates';

export const componentTemplates: ComponentTemplate[] = [
  new ReactNativeComponentTemplate(),
  new ReactNativeJSComponentTemplate(),
  new ReactNativeEnvTemplate(),
];
