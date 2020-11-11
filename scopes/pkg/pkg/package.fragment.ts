import { Component, ShowFragment } from '@teambit/component';
import { PkgMain } from './pkg.main.runtime';

export class PackageFragment implements ShowFragment {
  constructor(private pkg: PkgMain) {}

  title = 'package name';

  async renderRow(component: Component) {
    return {
      title: this.title,
      content: this.pkg.getPackageName(component),
    };
  }

  async json(component: Component) {
    return {
      title: this.title,
      json: this.pkg.getPackageName(component),
    };
  }

  weight = 3;
}
