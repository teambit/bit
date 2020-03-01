/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable no-plusplus */
/* eslint-disable max-len */
import { Subject, ReplaySubject } from 'rxjs';
import { ComponentCapsule } from '../../capsule/component-capsule';
import { Task } from '../task';

export class Flow {
  private result: any[] = [];
  constructor(private tasks: string[]) {}

  async execute(capsule: ComponentCapsule) {
    const id = capsule.id;
    const startTime = new Date();
    const subject = new ReplaySubject();
    subject.next({
      type: 'flow:start',
      id,
      value: startTime
    });

    if (this.tasks.length) {
      await this.execSequence(capsule, subject, startTime, 0);
    } else {
      setImmediate(() => this.handleDone(subject, capsule, startTime));
    }
    return subject;
  }

  private async execSequence(capsule: ComponentCapsule, subject: Subject<any>, start: Date, index: number) {
    const that = this;
    const task = await Task.execute(this.tasks[index], capsule);
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
      async complete() {
        if (that.tasks.length > index + 1) {
          await that.execSequence(capsule, subject, start, ++index);
        } else {
          that.handleDone(subject, capsule, start);
        }
      }
    });
  }

  private handleError(index: number, capsule: ComponentCapsule, data: any, subject: Subject<any>, start: Date) {
    for (let i = index + 1; i < this.tasks.length; ++i) {
      this.result.push({
        type: 'task:error',
        id: `${capsule.id}:${this.tasks[i]}`,
        value: new Error(`Error by ${data.id}`),
        errorBy: data
      });
    }
    const isError = true;
    this.handleDone(subject, capsule, start, isError);
    return this.tasks.length;
  }

  private handleDone(subject: Subject<any>, capsule: ComponentCapsule, start: Date, isError = false) {
    const endTime = new Date();
    subject[isError ? 'error' : 'next']({
      type: 'flow:result',
      id: capsule.id,
      value: this.result,
      endTime,
      duration: endTime.getTime() - start.getTime()
    });
    subject.complete();
    this.result = [];
  }
}
