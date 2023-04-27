import Table from 'cli-table';
import { ConfigWritersList } from '../workspace-config-files.main.runtime';

export function formatListOutput(result: ConfigWritersList): string {
  const head = ['Aspect ID', 'name', 'CLI name'];

  const rows = result.map((entry) => {
    return [entry.aspectId, entry.configWriter.name, entry.configWriter.cliName];
  });
  const table = new Table({ head, style: { head: ['cyan'] } });
  table.push(...rows);
  return table.toString();
}
