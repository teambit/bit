import type { GraphqlUI } from '@teambit/graphql';
import { PreviewRuntime } from '@teambit/preview';
import { GraphqlAspect } from '@teambit/graphql';
import { UIAspect } from './ui.aspect';
import { UIConfig } from './ui-config';

export class UiPreview {
  static slots = [];
  static dependencies = [GraphqlAspect];
  static runtime = PreviewRuntime;

  static async provider([graphqlUi]: [GraphqlUI], config: UIConfig) {
    if (config.urlBasename) {
      graphqlUi.setBasename(config.urlBasename);
    }

    return new UiPreview();
  }
}

UIAspect.addRuntime(UiPreview);
