export class BundlingStrategyNotFound extends Error {
  constructor(private strategyName: string) {
    super(`bundling strategy with name ${strategyName} was not found`);
  }
}
