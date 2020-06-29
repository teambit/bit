import { BundlerExtension } from '../bundler';

export class PreviewExtension {
  static dependencies = [BundlerExtension];

  static async provider([bundler]: [BundlerExtension]) {
    bundler.registerTarget({
      entry: () => [require.resolve('./preview.runtime')]
    });
  }
}
