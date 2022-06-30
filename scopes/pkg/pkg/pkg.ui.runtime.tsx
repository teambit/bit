import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { Install } from '@teambit/ui-foundation.ui.use-box.menu';
import ComponentAspect, { ComponentUI, ConsumePlugin } from '@teambit/component';
import { PkgAspect } from './pkg.aspect';

export class PkgUI {
  static runtime = UIRuntime;

  static dependencies = [ComponentAspect];

  static async provider([componentUI]: [ComponentUI]) {
    const pkg = new PkgUI();
    componentUI.registerConsumeMethod(pkg.npmConsumeMethod);
    return pkg;
  }

  private npmConsumeMethod: ConsumePlugin = (comp, options) => {
    if (options?.currentLane) return undefined;

    const registry = comp.packageName.split('/')[0];
    const packageVersion = comp.version === comp.latest ? '' : `@${comp.version}`;
    return {
      Title: <img style={{ width: '30px' }} src="https://static.bit.dev/brands/logo-npm-new.svg" />,
      Component: (
        <Install
          config={`npm config set '${registry}:registry' https://node.bit.cloud`}
          componentName={comp.id.name}
          packageManager="npm"
          copyString={`npm i ${comp.packageName}${packageVersion}`}
          registryName={registry}
        />
      ),
      order: 10,
    };
  };
}

export default PkgUI;

PkgAspect.addRuntime(PkgUI);
