import { RenderingContextSlot } from './preview.preview.runtime';

export class RenderingContext {
  constructor(private contexts: RenderingContextSlot) {}

  /**
   * obtain rendering context of a specific aspect.
   */
  get(aspectId: string) {
    return this.contexts.get(aspectId)?.();
  }
}
