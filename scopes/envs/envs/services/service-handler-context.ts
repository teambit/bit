import { ComponentID } from "@teambit/component";
import { Harmony } from "@teambit/harmony";
import { Logger, LoggerMain } from "@teambit/logger";
import { WorkerMain } from "@teambit/worker";

export class ServiceHandlerContext {
  constructor(
    /**
     * id of the environment defined in the context.
     */
    readonly envId: ComponentID,
    readonly loggerMain: LoggerMain,
    readonly workerMain: WorkerMain,
    readonly harmony: Harmony
  ) {}

  /**
   * return a logger instance for the env.
   */
  createLogger(name?: string): Logger {
    const loggerName = name  
      ? `${this.envId.toString()}::${name}`
      : this.envId.toString();
      
    return this.loggerMain.createLogger(loggerName);
  }

  /**
   * get an instance of an aspect. make sure it is loaded prior to requesting it.
   */
  getAspect<T>(aspectId: string) {
    return this.harmony.get<T>(aspectId);
  }

  /**
   * create worker for the env context.
   */
  createWorker<T>(name: string, path: string) {
    const worker = this.workerMain.declareWorker<T>(name, path);
    return worker;
  }
}
