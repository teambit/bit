import { Environment } from '@teambit/envs';

export class HtmlEnv implements Environment {
  icon = 'https://static.bit.dev/file_type_html5.svg';

  getMounter(){
    return require.resolve('./mount');
  }
}
