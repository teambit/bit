import { Environment } from '../environments';
import { ReactEnv } from '../react/react.env';

/**
 * a component environment built for [Aspects](https://reactjs.org) .
 */
export class AspectEnv implements Environment {
  constructor(private reactEnv: ReactEnv) {}

  getCompiler() {
    return this.reactEnv.getCompiler();
  }
}
