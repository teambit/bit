import { TimerAlreadyRunning, TimerNotStarted } from './exceptions';
import { TimerResponse } from './response';

export class Timer {
  private startTime: number | null = null;
  /**
   * start the timer.
   */
  start(): Timer {
    if (this.startTime) throw new TimerAlreadyRunning();
    this.startTime = Date.now();
    return this;
  }

  /**
   * stop the timer and return timer results.
   */
  stop(): TimerResponse {
    if (!this.startTime) throw new TimerNotStarted();
    const endTime = Date.now();
    return new TimerResponse(this.calculateElapsed(this.startTime, endTime));
  }

  private calculateElapsed(startTime: number, endTime: number) {
    return endTime - startTime;
  }

  /**
   * create a new timer instance.
   */
  static create() {
    return new Timer();
  }
}
