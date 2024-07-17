import { PkgAspect, PkgMain } from '@teambit/pkg';

export class SimpleConfig {
  constructor() {}

  static dependencies: any = [PkgAspect];

  static async provider([pkg]: [PkgMain]) {
    pkg.registerPackageJsonNewProps({ 'my-custom-key': 'my-custom-val' });
  }
}
