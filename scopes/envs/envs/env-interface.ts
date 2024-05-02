import { ServiceHandlerFactory as EnvHandler } from './services/service-handler';

export interface Env {
  [key: string]: EnvHandler<unknown> | any;
}
