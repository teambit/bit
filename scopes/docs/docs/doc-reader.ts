import type { Component } from '@teambit/component';
import { Doc } from '@teambit/docs.entities.doc';

export interface DocReader {
  /**
   * read a component doc.
   * @TODO refactor to virtual-file component after @david completes.
   */
  read(path: string, contents: Buffer, component: Component): Promise<Doc>;

  /**
   * determine which file formats are supported by the doc reader.
   */
  isFormatSupported(ext: string): boolean;
}
