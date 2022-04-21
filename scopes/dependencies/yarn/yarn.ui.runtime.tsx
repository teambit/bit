import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { Install } from '@teambit/ui-foundation.ui.use-box.menu';
import ComponentAspect, { ComponentUI, ConsumePlugin } from '@teambit/component';
import { YarnAspect } from './yarn.aspect';

export class YarnUI {
  static runtime = UIRuntime;

  static dependencies = [ComponentAspect];

  static async provider([componentUI]: [ComponentUI]) {
    const yarn = new YarnUI();
    componentUI.registerConsumeMethod(yarn.consumeMethod);
    return yarn;
  }

  private consumeMethod: ConsumePlugin = (comp, options) => {
    if (options?.currentLane) return undefined;

    const registry = comp.packageName.split('/')[0];
    const packageVersion = comp.version === comp.latest ? '' : `@${comp.version}`;
    return {
      Title: (
        <img style={{ height: '17px', paddingTop: '4px' }} src="https://static.bit.dev/brands/logo-yarn-text.svg" />
      ),
      Component: (
        <Install
          config={`npm config set '${registry}:registry' https://node.bit.cloud`}
          componentName={comp.id.name}
          packageManager="yarn"
          copyString={`yarn add ${comp.packageName}${packageVersion}`}
          registryName={registry}
        />
      ),
      order: 20,
    };
  };
}

export default YarnUI;

YarnAspect.addRuntime(YarnUI);
