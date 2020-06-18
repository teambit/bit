export interface DevServer {
  listen(port: number): Promise<void>;
}
