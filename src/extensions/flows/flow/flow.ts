/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable no-plusplus */
/* eslint-disable max-len */
import { Subject, ReplaySubject } from 'rxjs';
import { Task } from '../task';
import { Capsule } from '../../isolator/capsule';

export class Flow {
  private result: any[] = [];
  constructor(private tasks: string[]) {}

  async execute(capsule: Capsule) {
    const id = capsule.component.id.toString();
    const startTime = new Date();
    const subject = new ReplaySubject();
    subject.next({
      type: 'flow:start',
      id,
      value: startTime
    });
    if (this.tasks.length) {
      this.execSequence(capsule, subject, startTime, 0);
    } else {
      setImmediate(() => this.handleDone(subject, capsule, startTime));
    }
    return subject;
  }

  private execSequence(capsule: Capsule, subject: Subject<any>, start: Date, index: number) {
    const that = this;
    const task = Task.execute(this.tasks[index], capsule);
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
      }
    });
  }

  private handleError(index: number, capsule: Capsule, data: any, subject: Subject<any>, start: Date) {
    for (let i = index + 1; i < this.tasks.length; ++i) {
      this.result.push({
        type: 'task:error',
        id: `${capsule.component.id.toString()}:${this.tasks[i]}`,
        value: new Error(`Error by ${data.id}`),
        errorBy: data
      });
    }
    const isError = true;
    this.handleDone(subject, capsule, start, isError);
    return this.tasks.length;
  }

  private handleDone(subject: Subject<any>, capsule: Capsule, start: Date, isError = false) {
    const endTime = new Date();
    subject[isError ? 'error' : 'next']({
      type: 'flow:result',
      id: capsule.component.id.toString(),
      value: this.result,
      endTime,
      duration: endTime.getTime() - start.getTime()
    });
    subject.complete();
    this.result = [];
  }
}
