import { WebpackConfigMutator } from '@teambit/webpack';
import { get, set } from 'lodash';
// import { filter, remove } from 'lodash';

// type ModuleOpts = Exclude<WebpackConfigMutator['raw']['module'], undefined>;
// type Rules = Exclude<ModuleOpts['rules'], undefined>;
// type ArrayElement<ArrayType extends readonly unknown[]> = ArrayType extends readonly (infer ElementType)[]
//   ? ElementType
//   : never;

// type Rule = ArrayElement<Rules>;

export function removeExposedReactNative(config: WebpackConfigMutator) {
  if (config?.raw?.module?.rules) {
    config.raw.module.rules = config.raw.module.rules.filter((rule) => {
      // prettier-ignore

      return !(
        (
          // @ts-ignore
          rule.loader?.includes('expose-loader') &&
          // @ts-ignore
          typeof rule.test &&
          // @ts-ignore
          typeof rule.test === 'string' &&
          // @ts-ignore
          rule.test?.includes('/react-native/')
        )
      );
    });
  }
  return config;
}

export function removeReactNativePeerEntry(config: WebpackConfigMutator) {
  const peersImports = get(config.raw, 'entry.peers.import');
  if (peersImports) {
    set(
      config.raw,
      'entry.peers.import',
      peersImports.filter((name) => name !== 'react-native')
    );
  }
  return config;
}
