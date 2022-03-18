import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { Install } from '@teambit/ui-foundation.ui.use-box.menu';
import ComponentAspect, { ComponentUI, ConsumePlugin } from '@teambit/component';
import { PnpmAspect } from './pnpm.aspect';

export class PnpmUI {
  static runtime = UIRuntime;

  static dependencies = [ComponentAspect];

  static async provider([componentUI]: [ComponentUI]) {
    const pnpm = new PnpmUI();
    componentUI.registerConsumeMethod(pnpm.consumeMethod);
    return pnpm;
  }

  private consumeMethod: ConsumePlugin = (comp, options) => {
    if (options?.currentLane) return undefined;

    const registry = comp.packageName.split('/')[0];
    const packageVersion = comp.version === comp.latest ? '' : `@${comp.version}`;
    return {
      Title: <img style={{ height: '16px', marginTop: '-2px' }} src="https://static.bit.dev/brands/pnpm.svg" />,
      Component: (
        <Install
          config={`npm config set '${registry}:registry' https://node.bit.cloud`}
          componentName={comp.id.name}
          packageManager="pnpm"
          copyString={`pnpm i ${comp.packageName}${packageVersion}`}
          registryName={registry}
        />
      ),
      order: 30,
    };
  };
}

export default PnpmUI;

PnpmAspect.addRuntime(PnpmUI);
