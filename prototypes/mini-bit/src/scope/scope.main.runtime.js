import { ScopeAspect } from './scope.aspect.js';
import { LoggerAspect } from '../logger/logger.aspect.js';
import { listComponents } from './scope-internals.js';

export class ScopeMain {
  static id = ScopeAspect.id;
  static dependencies = [LoggerAspect];
  static slots = [];
  static async provider([logger]) {
    logger.createLogger('scope').info('ready');
    return new ScopeMain();
  }
  list() { return listComponents(); }
}
