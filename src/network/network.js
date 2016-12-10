/** @flow */
export interface Network {
  connect(host: string): Network;
  close(): void;
  get(commandName: string): Promise<any>;
}
