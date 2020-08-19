import { Harmony } from '@teambit/harmony';
import { AspectLoaderAspect } from './aspect-loader.aspect';
import { MainRuntime } from '../cli/cli.aspect';

export type AspectDescriptor = {
  /**
   * name of the extension.
   */
  id: string;

  /**
   * icon of the extension.
   */
  icon: string;
};

export class AspectLoaderMain {
  constructor(private harmony: Harmony) {}

  static runtime = MainRuntime;
  static dependencies = [];

  getDescriptor(id: string): AspectDescriptor {
    const instance = this.harmony.get<any>(id);
    const iconFn = instance.icon;
    const defaultIcon = `
      <svg width="50" height="50" xmlns="http://www.w3.org/2000/svg">
          <circle cx="25" cy="25" r="20"/>
      </svg>`;

    const icon = iconFn ? iconFn() : defaultIcon;

    return {
      id,
      icon,
    };
  }

  static async provider(deps, config, slots, harmony: Harmony) {
    return new AspectLoaderMain(harmony);
  }
}

AspectLoaderAspect.addRuntime(AspectLoaderMain);
