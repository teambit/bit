import { Writable } from 'stream';
import { ResolvedComponent } from '../../workspace/resolved-component';

export type PipeReporter = {
  out: Writable;
  err: Writable;
};

type ExecutionState = {
  [k: string]: {
    component: ResolvedComponent;
    sentToQueue: boolean;
    result: null | any;
    reporter: PipeReporter;
  };
};

export function createExecutionReporter(comps: ResolvedComponent[]) {
  const state: ExecutionState = comps.reduce((accum, curr) => {
    accum[curr.component.id._legacy.toString()] = {
      component: curr,
      sentToQueue: false,
      result: null,
      reporter: {
        out: new Writable(),
        err: new Writable()
      }
    };

    process.stderr;
    return accum;
  }, {} as ExecutionState);

  let userReporter;

  return {
    shouldExecute(seed: string) {
      return !state[seed].sentToQueue && !state[seed].result;
    },
    getResolvedComponent(seed: string) {
      return state[seed].component;
    },
    getSingleComponentReporter(seed: string) {
      return state[seed].reporter;
    },
    sentToQueue(seed: string) {
      state[seed].sentToQueue = true;
    },
    setResult(seed: string, result: any[] | Error) {
      state[seed].result = result;
    },
    setResults(seeds: string[], result: any[] | Error) {
      seeds.map(seed => this.setResult(seed, result));
    },
    createUserReporter() {
      userReporter = userReporter || _creatUserReporter(state);
      return userReporter;
    }
  };
}

function _creatUserReporter(state: ExecutionState) {
  return {};
}

process.stdout;
