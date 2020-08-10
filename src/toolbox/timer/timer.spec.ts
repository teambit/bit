import { expect } from 'chai';
import { sleep } from '../sleep';
import { Timer } from './timer';
import { TimerNotStarted, TimerAlreadyRunning } from './exceptions';

describe('Timer', () => {
  it('should stop after 100ms', async () => {
    const timer = Timer.create();
    timer.start();
    await sleep(50);
    const { elapsed } = timer.stop();
    expect(elapsed < 100).to.equal(true);
  });

  it('should return elapsed in seconds', async () => {
    const timer = Timer.create();
    timer.start();
    await sleep(50);
    const { seconds } = timer.stop();
    expect(seconds < 1).to.equal(true);
  });

  it('should throw an error if invoking stop without starting', () => {
    expect(() => {
      const timer = Timer.create();
      timer.stop();
    }).to.throw(TimerNotStarted);
  });

  it('should throw an error if invoking start twice', () => {
    expect(() => {
      const timer = Timer.create();
      timer.start();
      timer.start();
    }).to.throw(TimerAlreadyRunning);
  });
});
