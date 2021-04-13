export interface ApplicationType {
  name: string;
  serve(): Promise<void>;
}
