import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { Install } from '@teambit/ui-foundation.ui.use-box.menu';
import { ComponentAspect, ComponentUI, ConsumePlugin } from '@teambit/component';
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

  private npmConsumeMethod: ConsumePlugin = ({
    packageName: packageNameFromProps,
    latest: latestFromProps,
    id: componentId,
    options,
    componentModel,
  }) => {
    const packageName = componentModel?.packageName || packageNameFromProps;
    const latest = componentModel?.latest || latestFromProps;

    const registry = packageName.split('/')[0];

    const packageVersion =
      componentId.version === latest ? '' : `@${this.compUI.formatToInstallableVersion(componentId.version as string)}`;

    return {
      Title: <img style={{ width: '30px' }} src="https://static.bit.dev/brands/logo-npm-new.svg" />,
      Component: !options?.hide ? (
        <Install
          config={`npm config set '${registry}:registry' https://node-registry.bit.cloud`}
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
