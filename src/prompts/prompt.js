/** @flow */
import prompt from 'prompt';
import loader from '../cli/loader';

const DEFAULT_PROMPT_MESSAGE = '';

export default function (schema: Object): () => Promise<{ string: any }> {
  return function (): Promise<{ string: any }> {
    return new Promise((resolve, reject) => {
      loader.stop();
      prompt.start();
      prompt.message = DEFAULT_PROMPT_MESSAGE;

      prompt.get(schema, (err, res) => {
        if (err) return reject(err);
        loader.start();
        return resolve(res);
      });
    });
  };
}
