import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { Install } from '@teambit/ui-foundation.ui.use-box.menu';
import type { ComponentUI, ConsumePlugin } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { PkgAspect } from './pkg.aspect';

export class PkgUI {
  static runtime = UIRuntime;

  static dependencies = [ComponentAspect];

  static async provider([componentUI]: [ComponentUI]) {
    const pkg = new PkgUI(componentUI);
    componentUI.registerConsumeMethod(pkg.npmConsumeMethod);
    return pkg;
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

  private npmConsumeMethod: ConsumePlugin = ({
    packageName: packageNameFromProps,
    latest: latestFromProps,
    id: componentId,
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
      Title: <img style={{ width: '30px' }} src="https://static.bit.dev/brands/logo-npm-new.svg" />,
      Component: !options?.hide ? (
        <Install
          config={npmConfig}
          componentName={componentId.name}
          packageManager="npm"
          copyString={`npm i ${packageName}${packageVersion}`}
          registryName={registry}
          isInstallable={!options?.disableInstall}
        />
      ) : null,
      order: 30,
    };
  };
}

export default PkgUI;

PkgAspect.addRuntime(PkgUI);
