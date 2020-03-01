/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable no-plusplus */
/* eslint-disable max-len */
import {} from 'rxjs/operators';
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
      // this.handleDone(subject, capsule, startTime)
    }
    return subject;
  }

  private async execSequence(capsule: ComponentCapsule, subject: Subject<any>, start: Date, index: number) {
    const that = this;
    const stream = await Task.execute(that.tasks[index], capsule);
    subject.next(stream);
    stream.subscribe({
      next(data) {
        if (data.type === 'task:result') {
          that.result.push(data);
          if (data.code) {
            // handle error
            for (let i = index + 1; i < that.tasks.length; ++i) {
              that.result.push({
                type: 'task:error',
                id: `${capsule.id}:${that.tasks[i]}`,
                value: new Error(`Error by ${data.id}`),
                errorBy: data
              });
            }
            index = that.tasks.length;
            that.handleDone(subject, capsule, start);
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

  private handleDone(subject: Subject<any>, capsule: ComponentCapsule, start: Date) {
    const endTime = new Date();
    subject.next({
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
