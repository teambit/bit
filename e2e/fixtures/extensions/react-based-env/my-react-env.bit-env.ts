import { ReactEnv } from '@teambit/react.react-env';
import type { ReactEnvInterface } from '@teambit/react.react-env';

export class MyReactEnv extends ReactEnv implements ReactEnvInterface {
  /**
   * name of the environment. used for friendly mentions across bit.
   */
  name = 'my-custom-react';

  /**
   * icon for the env. use this to build a more friendly env.
   * uses react by default.
   */
  icon = 'https://static.bit.dev/extensions-icons/react.svg';
}

export default new MyReactEnv();
