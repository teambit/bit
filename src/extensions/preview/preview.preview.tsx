import { Slot, SlotRegistry } from '@teambit/harmony';
import { PreviewType } from './preview-type';
import { PreviewNotFound } from './exceptions';

let PREVIEW_MODULES: Record<string, previewModule> = {};
let RERENDER = () => {};

type previewModule = {
  componentMap: Record<string, any[]>;
  mainModule: { default: () => void };
};

export type PreviewSlot = SlotRegistry<PreviewType>;

export class Preview {
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
            const moduleMap = PREVIEW_MODULES[prevName];
            if (!moduleMap) return undefined;

            const componentModule = moduleMap?.componentMap[componentId];
            if (!componentModule) return undefined;

            return componentModule[0];
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

  static id = '@teambit/preview';

  static slots = [Slot.withType<PreviewType>()];

  static async provider(deps, config, [previewSlot]: [PreviewSlot]) {
    const preview = new Preview(previewSlot);

    RERENDER = preview.render;

    window.addEventListener('hashchange', () => {
      RERENDER();
    });

    return preview;
  }
}

export function updateModules(modules: Record<string, previewModule>) {
  PREVIEW_MODULES = modules;
  RERENDER();
}
