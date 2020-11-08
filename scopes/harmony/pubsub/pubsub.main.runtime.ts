// TODO: consider adding  process.on('message' (event) => {pub})
// - where child process listen to events from parent

import { MainRuntime } from '@teambit/cli';

import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';

import type { ChildProcess } from 'child_process';

type BitInterProcessesEvents = {
  headder: 'bit-inter-processes-events';
  bitEvent: {
    topicUUID: string;
    event: BitBaseEvent<any>;
  };
};

export class PubsubMain {
  private topicMap = {};
  private childProcesses: ChildProcess[] = [];

  private createOrGetTopic = (topicUUID) => {
    this.topicMap[topicUUID] = this.topicMap[topicUUID] || [];
  };

  public sub(topicUUID, callback) {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].push(callback);
  }

  public pub(topicUUID: string, event: BitBaseEvent<any>) {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].forEach((callback) => callback(event));
    this.tryToSendAsSubprocess(topicUUID, event);
    this.tryToSendToChildProcesses(topicUUID, event);
  }

  public addProcess(childProcess: ChildProcess) {
    childProcess.on('message', (msg: BitInterProcessesEvents) => {
      // Message from child
      if (msg.headder === 'bit-inter-processes-events') {
        const deserializeEvent: BitBaseEvent<any> = JSON.parse(msg.bitEvent.event.toString());
        this.pubToLocalProcessOnly(msg.bitEvent.topicUUID, deserializeEvent);
      }
      this.childProcesses.push(childProcess);
    });
  }

  // Helpers
  private pubToLocalProcessOnly(topicUUID: string, event: BitBaseEvent<any>) {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].forEach((callback) => callback(event));
  }

  private tryToSendToChildProcesses(topicUUID: string, event: BitBaseEvent<any>) {
    this.childProcesses.forEach((process) => {
      const limitedSerializedEvent = JSON.stringify(event, this.censor(event));
      process.send({ headder: 'bit-inter-processes-events', bitEvent: { topicUUID, event: limitedSerializedEvent } });
    });
  }

  private tryToSendAsSubprocess(topicUUID: string, event: BitBaseEvent<any>) {
    if (process.send) {
      const limitedSerializedEvent = JSON.stringify(event, this.censor(event));
      process.send({ headder: 'bit-inter-processes-events', bitEvent: { topicUUID, event: limitedSerializedEvent } });
    }
  }

  private censor(censor) {
    let i = 0;
    return (key, value) => {
      if (i !== 0 && typeof censor === 'object' && typeof value == 'object' && censor == value) return '[Circular]';
      if (i >= 29)
        // seems to be a harded maximum of 30 serialized objects?
        return '[Unknown]';
      ++i; // so we know we aren't using the original object anymore
      return value;
    };
  }

  static runtime = MainRuntime;

  static async provider() {
    return new PubsubMain();
  }
}

PubsubAspect.addRuntime(PubsubMain);
