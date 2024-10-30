import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { Install } from '@teambit/ui-foundation.ui.use-box.menu';
import { ComponentAspect, ComponentUI, ConsumePlugin } from '@teambit/component';
import { YarnAspect } from './yarn.aspect';

export class YarnUI {
  static runtime = UIRuntime;

  static dependencies = [ComponentAspect];

  static async provider([componentUI]: [ComponentUI]) {
    const yarn = new YarnUI(componentUI);
    componentUI.registerConsumeMethod(yarn.consumeMethod);
    return yarn;
  }

  constructor(private compUI: ComponentUI) {}

  private consumeMethod: ConsumePlugin = ({
    packageName: packageNameFromProps,
    id: componentId,
    latest: latestFromProps,
    options,
    componentModel,
  }) => {
    const packageName = componentModel?.packageName || packageNameFromProps;
    const latest = componentModel?.latest || latestFromProps;

    const registry = packageName.split('/')[0];
    const packageVersion =
      componentId.version === latest ? '' : `@${this.compUI.formatToInstallableVersion(componentId.version as string)}`;

    return {
      Title: (
        <img style={{ height: '17px', paddingTop: '4px' }} src="https://static.bit.dev/brands/logo-yarn-text.svg" />
      ),
      Component: !options?.hide ? (
        <Install
          config={`npm config set '${registry}:registry' https://node-registry.bit.cloud`}
          componentName={componentId.name}
          packageManager="yarn"
          copyString={`yarn add ${packageName}${packageVersion}`}
          registryName={registry}
          isInstallable={!options?.disableInstall}
        />
      ) : null,
      order: 20,
    };
  };
}

export default YarnUI;

YarnAspect.addRuntime(YarnUI);
