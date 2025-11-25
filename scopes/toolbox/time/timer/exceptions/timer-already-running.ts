export class TimerAlreadyRunning extends Error {
  constructor() {
    super('timer already running');
  }
}
