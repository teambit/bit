export class TimerResponse {
  constructor(
    /**
     * elapsed time in milliseconds.
     */
    readonly elapsed: number
  ) {}

  /**
   * elapsed time in seconds\.
   */
  get seconds() {
    return this.elapsed / 1000;
  }
}
