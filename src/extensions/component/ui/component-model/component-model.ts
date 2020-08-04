import { Composition, CompositionProps } from '../../../compositions/composition';
import { ComponentID } from '../../id';
import { TagMap } from '../../tag-map';
import { Tag } from '../../tag';
// import { Snap } from '../../snap';

export type ComponentModelProps = {
  id: string;
  version: string;
  server: ComponentServer;
  displayName: string;
  packageName: string;
  compositions: CompositionProps[];
  // TODO - @guy, why is this of type any?
  tags: any[];
};

export type ComponentServer = {
  env: string;
  url: string;
};

export class ComponentModel {
  constructor(
    /**
     * id of the component
     */
    readonly id: ComponentID,

    /**
     * display name of the component.
     */
    readonly displayName: string,

    /**
     * package name of the component.
     */
    readonly packageName: string,

    /**
     * the component server.
     */
    readonly server: ComponentServer,

    /**
     * array of compositions
     */
    readonly compositions: Composition[],

    /**
     * tags of the component.
     */
    readonly tags: TagMap
  ) {}

  get version() {
    if (!this.id.version) return 'new';
    return this.id.version;
  }

  /**
   * create an instance of a component from a plain object.
   */
  static from({ id, server, displayName, compositions, packageName, tags }: ComponentModelProps) {
    const tagsArray = tags || [];

    return new ComponentModel(
      ComponentID.fromObject(id),
      displayName,
      packageName,
      server,
      Composition.fromArray(compositions || []),
      TagMap.fromArray(tagsArray.map((tag) => Tag.fromObject(tag)))
    );
  }

  static empty() {
    return new ComponentModel(
      ComponentID.fromObject({ name: 'root' }),
      '',
      '',
      { env: '', url: '' },
      [],
      TagMap.empty()
    );
  }
}
