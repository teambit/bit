import { ResolvedComponent } from '../../workspace/resolved-component';

type ExecutionState = {
  [k: string]: {
    component: ResolvedComponent;
    sentToQueue: boolean;
    result: null | any;
    reporter: any;
  };
};

export function createExecutionReporter(comps: ResolvedComponent[]) {
  const state: ExecutionState = comps.reduce((accum, curr) => {
    accum[curr.component.id._legacy.toString()] = {
      component: curr,
      sentToQueue: false,
      result: null,
      reporter: {}
    };
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
    sendToQueue(seed: string) {
      state[seed].sentToQueue = true;
    },
    setResult(seed: string, result: any[] | Error) {
      state[seed].result = result;
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
