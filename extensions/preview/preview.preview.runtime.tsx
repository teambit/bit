import { Slot, SlotRegistry } from '@teambit/harmony';

import { PreviewNotFound } from './exceptions';
import { PreviewType } from './preview-type';
import { PreviewAspect, PreviewRuntime } from './preview.aspect';

export type PreviewSlot = SlotRegistry<PreviewType>;

const PREVIEW_MODULES = {};

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
            if (!PREVIEW_MODULES[prevName].componentMap[componentId]) return undefined;
            return PREVIEW_MODULES[prevName].componentMap[componentId][0];
          })
          .filter((module) => !!module)
      : [];

    return preview.render(componentId, PREVIEW_MODULES[name], includes);
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

    window.addEventListener('hashchange', () => {
      preview.render();
    });

    return preview;
  }
}

export function linkModules(previewName: string, defaultModule: any, componentMap: { [key: string]: any }) {
  PREVIEW_MODULES[previewName] = {
    mainModule: defaultModule,
    componentMap,
  };
}

PreviewAspect.addRuntime(PreviewPreview);
