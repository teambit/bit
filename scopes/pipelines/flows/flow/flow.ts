/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable no-plusplus */
/* eslint-disable max-len */
import { Capsule } from '@teambit/isolator';
import logger from '@teambit/legacy/dist/logger/logger';
import { ReplaySubject, Subject } from 'rxjs';

import { executeTask } from '../task';

export class Flow {
  private result: any[] = [];
  constructor(private tasks: string[]) {}
  /**
   * Takes a capsule and return a stream of streams.
   * Return value represent the execution of tasks.
   *
   * @param capsule ComponentCapsule to execute tasks
   */
  execute(capsule: Capsule): ReplaySubject<any> {
    const id = capsule.component.id.toString();
    const startTime = new Date();
    const subject = new ReplaySubject();
    subject.next({
      type: 'flow:start',
      id,
      startTime,
    });
    if (this.tasks && this.tasks.length) {
      logger.debug(`flowsExt, flow.execute of ${id}. tasks: ${this.tasks.join(', ')}`);
      this.execSequence(capsule, subject, startTime, 0);
    } else {
      logger.debug(`flowsExt, flow.execute of ${id}. no tasks. handleDone`);
      setImmediate(() => this.handleDone(subject, capsule, startTime));
    }
    return subject;
  }

  private execSequence(capsule: Capsule, subject: Subject<any>, start: Date, index: number) {
    const id = capsule.component.id.toString();
    logger.debug(`flowsExt, flow.execSequence of ${id}. index: ${index}`);
    const that = this;
    const task = executeTask(this.tasks[index], capsule);
    subject.next(task);
    task.subscribe({
      next(data) {
        if (data.type === 'task:result') {
          that.result.push(data);
          if (data.code) {
            index = that.handleError(index, capsule, data, subject, start);
          }
        }
      },
      complete() {
        if (that.tasks.length > index + 1) {
          that.execSequence(capsule, subject, start, ++index);
        } else {
          that.handleDone(subject, capsule, start);
        }
      },
    });
  }

  private handleError(index: number, capsule: Capsule, data: any, subject: Subject<any>, start: Date) {
    for (let i = index + 1; i < this.tasks.length; ++i) {
      this.result.push({
        type: 'task:error',
        id: `${capsule.component.id.toString()}:${this.tasks[i]}`,
        value: new Error(`Error by ${data.id}`),
        errorBy: data,
      });
    }
    const isError = true;
    this.handleDone(subject, capsule, start, isError);
    return this.tasks.length;
  }

  private handleDone(subject: Subject<any>, capsule: Capsule, startTime: Date, isError = false) {
    const endTime = new Date();
    logger.debug(`flowsExt, flow.handleDone of ${capsule.component.id.toString()}. isError: ${isError}`);
    subject[isError ? 'error' : 'next']({
      type: 'flow:result',
      id: capsule.component.id,
      value: {
        capsule,
        tasks: this.result,
      },
      code: isError ? 1 : 0,
      startTime,
      duration: endTime.getTime() - startTime.getTime(),
    });
    setTimeout(subject.complete.bind(subject), 0);
    this.result = [];
  }
}
