import PackageManager from './package-manager';

export async function providePackageManager() {
  return new PackageManager('yarn');
}
