export type ComponentModelProps = {
  id: string;
  server: ComponentServer;
  displayName: string;
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
     * display name of the component.
     */
    readonly displayName: string,

    /**
     * the component server.
     */
    readonly server: ComponentServer
  ) {}

  /**
   * create an instance of a component from a plain object.
   */
  static from({ id, server, displayName }: ComponentModelProps) {
    return new ComponentModel(id, displayName, server);
  }

  static empty() {
    return new ComponentModel('', '', { env: '', url: '' });
  }
}
