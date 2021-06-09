import { Environment } from '@teambit/envs';

export class HtmlEnv implements Environment {
  icon = 'https://static.bit.dev/file-icons/file_type_html.svg';

  getMounter(){
    return require.resolve('./mount');
  }
}
