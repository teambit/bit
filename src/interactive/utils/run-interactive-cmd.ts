import chalk from 'chalk';
import execa from 'execa';
import pSeries from 'p-series';
import rightpad from 'pad-right';

export type InteractiveInputs = InteractiveInputDefinition[];

export type InteractiveInputDefinition = {
  triggerText: string;
  inputs: InteractiveInput[];
};

export type InteractiveInput = {
  // The actual value to enter
  value: string | InteractiveKey;
  // time (ms) to wait before enter the line
  // Used usually to wait more when running remote actions
  waitInput?: number;
};

export type InteractiveKey = {
  // Used for debug printing
  label: string;
  value: string;
};

export type InteractiveKeyName = 'up' | 'down' | 'enter' | 'space';

type InteractiveKeys = { [key in InteractiveKeyName]: InteractiveKey };

const DEFAULT_DEFAULT_INTERVAL_BETWEEN_INPUTS = 100;

export const INTERACTIVE_KEYS: InteractiveKeys = {
  up: { label: 'up', value: '\x1B\x5B\x41' },
  down: { label: 'down', value: '\x1B\x5B\x42' },
  enter: { label: 'enter', value: '\x0D' },
  space: { label: 'space', value: '\x20' },
};

// Based on (with a lot of modifications):
// https://github.com/ewnd9/inquirer-test/blob/6e2c40bbd39a061d3e52a8b1ee52cdac88f8d7f7/index.js#L14
// https://medium.com/@zorrodg/integration-tests-on-node-js-cli-part-2-testing-interaction-user-input-6f345d4b713a
export default (async function runInteractive({
  processName,
  args = [],
  inputs = [],
  // Options for the process (execa)
  processOpts = {
    cwd: '/tmp/aa',
  },
  // opts for interactive
  opts = {
    defaultIntervalBetweenInputs: DEFAULT_DEFAULT_INTERVAL_BETWEEN_INPUTS,
    verbose: false,
  },
}: {
  processName: string;
  args: string[];
  inputs: InteractiveInputs;
  processOpts: Record<string, any>;
  opts: {
    // Default interval between inputs in case there is no specific interval
    defaultIntervalBetweenInputs: number;
    // print some outputs (like the command running, the args, inputs)
    verbose: boolean;
  };
}) {
  const actualDefaultIntervalBetweenInputs =
    opts.defaultIntervalBetweenInputs || DEFAULT_DEFAULT_INTERVAL_BETWEEN_INPUTS;
  if (opts.verbose) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    console.log(rightpad(chalk.green('cwd: '), 20, ' '), processOpts.cwd); // eslint-disable-line no-console
    console.log(rightpad(chalk.green('command: '), 20, ' '), `${processName} ${args.join(' ')}`); // eslint-disable-line no-console
    _printInputs(inputs, actualDefaultIntervalBetweenInputs);
  }

  const child = execa(processName, args, processOpts);

  let currentInputTimeout;

  const writePromiseTimeout = async (input: InteractiveInput): Promise<void> => {
    return new Promise((resolve) => {
      const timeout = input.waitInput || actualDefaultIntervalBetweenInputs;
      const inputValue = typeof input.value === 'string' ? input.value : input.value.value;
      currentInputTimeout = setTimeout(() => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        child.stdin.write(inputValue);
        resolve();
      }, timeout);
    });
  };

  /**
   * A function to wrap the promise with another function to prepare it for p-series
   * @param {*} input
   */
  const wrapInputWriting = (input: InteractiveInput) => () => writePromiseTimeout(input);

  const writeInputsArray = async (inputsArr: InteractiveInput[]) => {
    const writeInputsP = inputsArr.map(wrapInputWriting);
    return pSeries(writeInputsP);
  };

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  child.stderr.once('data', () => {
    console.log('got an error from child'); // eslint-disable-line no-console
    // If child errors out, stop all the pending inputs if any
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    child.stdin.end();

    if (currentInputTimeout) {
      clearTimeout(currentInputTimeout);
      inputs = [];
    }
  });

  // Kick off the process
  let pointer = 0;
  let leftInputsArrays = inputs.length;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  child.stdout.on('data', (chunk) => {
    const currString = chunk.toString();
    if (pointer < inputs.length) {
      const triggerText = inputs[pointer].triggerText;
      // We remove the eol since sometime interactive frameworks added line breaks if the question is too long
      if (_removeEol(currString).includes(_removeEol(triggerText))) {
        const inputsToWrite = inputs[pointer].inputs;
        // eslint-disable-next-line promise/catch-or-return, @typescript-eslint/no-floating-promises
        writeInputsArray(inputsToWrite).then(() => {
          leftInputsArrays -= 1;
          // Finished to write all - end stream
          if (leftInputsArrays === 0) {
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            child.stdin.end();
          }
        });

        pointer += 1;
      }
    }
  });
  return child;
});

function _printInputs(inputsToPrint: InteractiveInputs, actualDefaultIntervalBetweenInputs: number) {
  const getTriggerOutput = (trigger) => {
    return `${chalk.blue('trigger:')} ${trigger} `;
  };
  const getInputOutput = (input) => {
    const timeout = input.waitInput || actualDefaultIntervalBetweenInputs;
    const label = typeof input.value === 'string' ? input.value : input.value.label;
    return `${label}(${timeout})`;
  };
  const getInputsOutput = (inputs) => {
    const inputsOutput = inputs.map(getInputOutput).join(' ');
    return `${chalk.yellow('inputs:')} ${inputsOutput}`;
  };
  const getEntryOutput = (entry) => {
    const triggerOutput = getTriggerOutput(entry.triggerText);
    const inputsOutput = getInputsOutput(entry.inputs);
    return `${triggerOutput} ${inputsOutput}`;
  };
  const output = inputsToPrint.map(getEntryOutput).join('\n');
  console.log(rightpad(chalk.green('inputs:\n'), 20, ''), output); // eslint-disable-line no-console
}

function _removeEol(str: string) {
  return str.replace(/\n/, '');
}
