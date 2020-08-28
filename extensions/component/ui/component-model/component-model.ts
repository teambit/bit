import { Composition, CompositionProps } from '@teambit/compositions';
import { DeprecationInfo } from '@teambit/deprecation';
import { Descriptor } from '@teambit/environments';

import { ComponentID } from '../../id';
import { Tag } from '../../tag';
import { TagMap } from '../../tag-map';
import { TagProps } from '../../tag/tag';
// import { Snap } from '../../snap';

export type ComponentModelProps = {
  id: string;
  version: string;
  server: ComponentServer;
  displayName: string;
  packageName: string;
  compositions: CompositionProps[];
  tags: TagProps[];
  status: any;
  deprecation: DeprecationInfo;
  env: Descriptor;
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
    readonly tags: TagMap,

    /**
     * status of component.
     */
    readonly status?: any,

    /**
     * deprecation info of the component.
     */
    readonly deprecation?: DeprecationInfo,

    /**
     * env descriptor.
     */

    readonly environment?: Descriptor
  ) {}

  get version() {
    if (!this.id.version) return 'new';
    return this.id.version;
  }

  /**
   * create an instance of a component from a plain object.
   */
  static from({
    id,
    server,
    displayName,
    compositions,
    packageName,
    tags,
    deprecation,
    env,
    status,
  }: ComponentModelProps) {
    const tagsArray = tags || [];

    return new ComponentModel(
      ComponentID.fromObject(id),
      displayName,
      packageName,
      server,
      Composition.fromArray(compositions || []),
      TagMap.fromArray(tagsArray.map((tag) => Tag.fromObject(tag))),
      status,
      deprecation,
      env
    );
  }

  static fromArray(componentsProps: ComponentModelProps[]) {
    return componentsProps.map((rawComponent) => ComponentModel.from(rawComponent));
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
