import { Application } from './application';

export interface ApplicationType<T> {
  name: string;
  createApp(options: T): Application;
}
