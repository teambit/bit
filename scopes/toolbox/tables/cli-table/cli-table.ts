import Table from 'cli-table';
import colors from 'colors';

export class CLITable {
  constructor(private headers: any, private body: string[][], private options?: Record<string, any>) {}

  render(): string {
    const table = new Table({ head: this.headers, style: { border: ['grey'] } });
    this.body.map((value) => {
      const color = colors[this.options?.color] || colors.cyan;
      value[0] = color(value[0]);
      return table.push(value);
    });
    return table.toString();
  }

  /**
   * sort by the first column
   */
  sort() {
    this.body.sort((a, b) => {
      const aValue = a[0];
      const bValue = b[0];
      if (aValue < bValue) return -1;
      if (aValue > bValue) return 1;
      return 0;
    });
  }

  static fromObject(header: { value: string }[], data: Record<string, string>[]) {
    const headers = Object.values(header).map((d) => colors.cyan(d.value));
    return new CLITable(
      headers,
      data.map((value) => Object.values(value)),
      { color: 'white' }
    );
  }
}
