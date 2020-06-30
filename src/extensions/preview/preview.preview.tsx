import { Slot, SlotRegistry } from '@teambit/harmony';
import { PreviewType } from './preview-type';
import { PreviewNotFound } from './exceptions';

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
  render() {
    const { previewName, componentId } = this.getLocation();

    const preview = this.getPreview(previewName || this.getDefault());
    if (!preview) {
      throw new PreviewNotFound(previewName);
    }

    return preview.render(componentId);
  }

  /**
   * register a new preview.
   */
  registerPreview(preview: PreviewType) {
    this.previewSlot.register(preview);
    return this;
  }

  getDefault() {
    const previews = this.previewSlot.values();
    const defaultOne = previews.find(previewCandidate => previewCandidate.default);

    return defaultOne?.name || previews[0].name;
  }

  private getPreview(previewName: string): undefined | PreviewType {
    const previews = this.previewSlot.values();
    const preview = previews.find(previewCandidate => previewCandidate.name === previewName);

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
      componentId: before
    };
  }

  static slots = [Slot.withType<PreviewType>()];

  static async provider(deps, config, [previewSlot]: [PreviewSlot]) {
    return new Preview(previewSlot);
  }
}
