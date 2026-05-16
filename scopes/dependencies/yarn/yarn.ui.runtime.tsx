import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { Install } from '@teambit/ui-foundation.ui.use-box.menu';
import type { ComponentUI, ConsumePlugin } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
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

  private getNpmConfig(registry: string, authToken?: string): string {
    const registryUrl = 'https://node-registry.bit.cloud';
    const configs = [
      `${registry}:registry="${registryUrl}"`,
      authToken ? `"//node-registry.bit.cloud/:_authToken=${authToken}"` : undefined,
    ].filter(Boolean);
    return `npm config set ${configs.join(' ')}`;
  }

  private consumeMethod: ConsumePlugin = ({
    packageName: packageNameFromProps,
    id: componentId,
    latest: latestFromProps,
    options,
    componentModel,
    authToken,
  }) => {
    const packageName = componentModel?.packageName || packageNameFromProps;
    const latest = componentModel?.latest || latestFromProps;

    const registry = packageName.split('/')[0];
    const packageVersion =
      componentId.version === latest ? '' : `@${this.compUI.formatToInstallableVersion(componentId.version as string)}`;
    const npmConfig = this.getNpmConfig(registry, authToken);

    return {
      Title: (
        <img style={{ height: '17px', paddingTop: '4px' }} src="https://static.bit.dev/brands/logo-yarn-text.svg" />
      ),
      Component: !options?.hide ? (
        <Install
          config={npmConfig}
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
