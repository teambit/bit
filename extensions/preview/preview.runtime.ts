import { Harmony } from '@teambit/harmony';
import { DocsAspect } from '@teambit/docs';
import { PreviewPreview } from './preview.preview.runtime';
import { CompositionsAspect } from '@teambit/compositions';
import { GraphqlAspect } from '@teambit/graphql';
import { PreviewAspect, PreviewRuntime } from './preview.aspect';

/**
 * configure all core extensions
 * :TODO pass all other extensions from above.
 */
Harmony.load([PreviewAspect, DocsAspect, CompositionsAspect, GraphqlAspect], PreviewRuntime.name, {})
  .then((harmony) => {
    harmony
      .run()
      .then(() => {
        const uiExtension = harmony.get<PreviewPreview>('teambit.bit/preview');
        uiExtension.render();
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(err);
      });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
  });
