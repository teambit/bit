import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { Install } from '@teambit/ui-foundation.ui.use-box.menu';
import { ComponentAspect, ComponentUI, ConsumePlugin } from '@teambit/component';
import { PnpmAspect } from './pnpm.aspect';

export class PnpmUI {
  static runtime = UIRuntime;

  static dependencies = [ComponentAspect];

  static async provider([componentUI]: [ComponentUI]) {
    const pnpm = new PnpmUI(componentUI);
    componentUI.registerConsumeMethod(pnpm.consumeMethod);
    return pnpm;
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
    id: componentId,
    packageName: packageNameFromProps,
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
      Title: <img style={{ height: '16px', marginTop: '-2px' }} src="https://static.bit.dev/brands/pnpm.svg" />,
      Component: !options?.hide ? (
        <Install
          config={npmConfig}
          componentName={componentId.name}
          packageManager="pnpm"
          copyString={`pnpm i ${packageName}${packageVersion}`}
          registryName={registry}
          isInstallable={!options?.disableInstall}
        />
      ) : null,
      order: 10,
    };
  };
}

export default PnpmUI;

PnpmAspect.addRuntime(PnpmUI);
