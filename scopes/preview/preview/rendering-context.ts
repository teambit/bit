import { RenderingContextSlot } from './preview.preview.runtime';

export type RenderingContextOptions = { aspectsFilter?: string[] };
export type RenderingContextProvider = (options: RenderingContextOptions) => { [key: string]: any };

export class RenderingContext {
  constructor(
    private contexts: RenderingContextSlot,
    private options: RenderingContextOptions = {}
  ) {}

  /**
   * obtain rendering context of a specific aspect.
   */
  get(aspectId: string) {
    const contextFactory = this.contexts.get(aspectId);
    return contextFactory?.(this.options);
  }
}
