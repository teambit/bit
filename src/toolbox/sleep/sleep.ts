/**
 * sleep for given period of time.
 * @param time period of time to sleep.
 */
export async function sleep(time: number) {
  await new Promise((resolve) => setTimeout(resolve, time));
}
