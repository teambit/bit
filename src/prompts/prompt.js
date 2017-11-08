/** @flow */
import prompt from 'prompt';
import loader from '../cli/loader';
import { PromptCanceled } from './exceptions';

const DEFAULT_PROMPT_MSG = '';
const CANCEL_ERROR_MSG = 'canceled';

export default function (schema: Object): () => Promise<{ string: any }> {
  return function (): Promise<{ string: any }> {
    return new Promise((resolve, reject) => {
      loader.stop();
      prompt.start();
      prompt.message = DEFAULT_PROMPT_MSG;

      prompt.get(schema, (err, res) => {
        if (err) {
          if (err.message === CANCEL_ERROR_MSG) {
            reject(new PromptCanceled());
          }
          return reject(err);
        }
        loader.start();
        return resolve(res);
      });
    });
  };
}
