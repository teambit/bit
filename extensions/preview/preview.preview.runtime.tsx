import { Slot, SlotRegistry } from '@teambit/harmony';
import { PreviewType } from './preview-type';
import { PreviewNotFound } from './exceptions';
import { PreviewRuntime, PreviewAspect } from './preview.aspect';

export type PreviewSlot = SlotRegistry<PreviewType>;

let PREVIEW_MODULES: Record<string, previewModule> = {};
let RERENDER = () => {};

type previewModule = {
  componentMap: Record<string, any[]>;
  mainModule: { default: () => void };
};

export class PreviewPreview {
  constructor(
    /**
     * preview slot.
     */
    private previewSlot: PreviewSlot
  ) {}

  /**
   * render the preview.
   */
  render = () => {
    const { previewName, componentId } = this.getLocation();
    const name = previewName || this.getDefault();

    const preview = this.getPreview(name);
    if (!preview) {
      throw new PreviewNotFound(previewName);
    }

    const includes = preview.include
      ? preview.include
          .map((prevName) => {
            if (!PREVIEW_MODULES[prevName]?.componentMap[componentId]) return undefined;
            return PREVIEW_MODULES[prevName].componentMap[componentId][0];
          })
          .filter((module) => !!module)
      : [];

    const previewModule = PREVIEW_MODULES[name];
    return preview.render(componentId, previewModule, includes);
  };

  /**
   * register a new preview.
   */
  registerPreview(preview: PreviewType) {
    this.previewSlot.register(preview);
    return this;
  }

  getDefault() {
    const previews = this.previewSlot.values();
    const defaultOne = previews.find((previewCandidate) => previewCandidate.default);

    return defaultOne?.name || previews[0].name;
  }

  private getPreview(previewName: string): undefined | PreviewType {
    const previews = this.previewSlot.values();
    const preview = previews.find((previewCandidate) => previewCandidate.name === previewName);

    return preview;
  }

  private getParam(query: string, param: string) {
    const params = new URLSearchParams(query);
    return params.get(param);
  }

  private getLocation() {
    const withoutHash = window.location.hash.substring(1);
    const [before, after] = withoutHash.split('?');

    return {
      previewName: this.getParam(after, 'preview'),
      componentId: before,
    };
  }

  static runtime = PreviewRuntime;

  static slots = [Slot.withType<PreviewType>()];

  static async provider(deps, config, [previewSlot]: [PreviewSlot]) {
    const preview = new PreviewPreview(previewSlot);

    RERENDER = preview.render;

    window.addEventListener('hashchange', () => {
      RERENDER();
    });

    return preview;
  }
}

// I don't like this implementation, it seems too loose and unpredictable.
// I'd rather have a dynamic import using `process.env.previewPath` or something of this sort.

/** allows other extensions to inject preview definitions.
 * as target components reside in another project all together,
 * we cannot reference them from here, and they have to reference us.
 */
export function updateModules(modules: Record<string, previewModule>) {
  PREVIEW_MODULES = modules;
  RERENDER();
}

PreviewAspect.addRuntime(PreviewPreview);
