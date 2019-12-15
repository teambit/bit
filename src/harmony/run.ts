import { Config, ConfigFactory } from './config';

type StepObject = {
  id: string;
};

type StepKinds = string | Array<string | StepObject>;

export async function run(step: StepKinds, factory: ConfigFactory) {
  const config = new Config(factory());
  if (!Array.isArray(step) && !config[step]) {
    console.log('no build step');
    return;
  }
  const actualSteps: Array<string | StepObject> = Array.isArray(step) ? step : config[step];
  return handleSteps(actualSteps, config);
}

async function handleSteps(steps: (string | StepObject)[], config: Config) {
  for (const step in steps) {
    await handleStep(step, config);
  }
}
function handleStep(step: string | StepObject, config: Config) {}
