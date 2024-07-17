import { expect } from 'chai';
import { TimerAlreadyRunning, TimerNotStarted } from './exceptions';
import { Timer } from './timer';

async function sleep(time: number) {
  await new Promise((resolve) => setTimeout(resolve, time));
}

describe('Timer', () => {
  it('should stop after 300ms', async () => {
    const timer = Timer.create();
    timer.start();
    await sleep(50);
    const { elapsed } = timer.stop();
    expect(elapsed < 300).to.equal(true);
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
