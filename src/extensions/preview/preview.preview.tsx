import { Slot, SlotRegistry } from '@teambit/harmony';
import { PreviewType } from './preview-type';

export type PreviewSlot = SlotRegistry<PreviewType>;

export class Preview {
  constructor(private previewSlot: PreviewSlot) {}

  /**
   * render the preview.
   */
  render() {
    return this.previewSlot.values()[0].render();
  }

  /**
   * register a new preview.
   */
  registerPreview(preview: PreviewType) {
    this.previewSlot.register(preview);
    return this;
  }

  static slots = [Slot.withType<PreviewType>()];

  static async provider(deps, config, [previewSlot]: [PreviewSlot]) {
    return new Preview(previewSlot);
  }
}
