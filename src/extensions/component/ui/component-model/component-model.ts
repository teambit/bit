import { Composition, CompositionProps } from '../../../compositions/composition';

export type ComponentModelProps = {
  id: string;
  version: string;
  server: ComponentServer;
  displayName: string;
  packageName: string;
  compositions: CompositionProps[];
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
    readonly id: string,

    /**
     * version of the component.
     */
    readonly version: string,

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
    readonly compositions: Composition[]
  ) {}

  /**
   * create an instance of a component from a plain object.
   */
  static from({ id, version, server, displayName, compositions, packageName }: ComponentModelProps) {
    return new ComponentModel(id, version, displayName, packageName, server, Composition.fromArray(compositions));
  }

  static empty() {
    return new ComponentModel('', '', '', '', { env: '', url: '' }, []);
  }
}
