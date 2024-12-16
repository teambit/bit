export class TimerNotStarted extends Error {
  constructor() {
    super('timer already running');
  }
}
