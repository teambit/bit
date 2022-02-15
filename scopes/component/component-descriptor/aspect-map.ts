export type AspectDataEntry = {
  aspectId: string;
  aspectData: string;
};

export type AspectMapProps = {
  entries?: AspectDataEntry[];
};

export class AspectMap {
  constructor(private entries: AspectDataEntry[]) {}

  get<T>(aspectId: string): T | undefined {
    if (!this.entries || !Array.isArray(this.entries)) return undefined;
    const aspectEntry = this.entries.find((entry) => entry.aspectId === aspectId);
    if (!aspectEntry) return undefined;
    if (typeof aspectEntry.aspectData === 'string') {
      return JSON.parse(aspectEntry.aspectData) as T;
    }
    return aspectEntry.aspectData as T;
  }

  toObject(): AspectMapProps {
    return {
      entries: this.entries,
    };
  }

  static fromObject(obj?: AspectMapProps) {
    const entries = obj?.entries || [];
    return new AspectMap(entries);
  }
}
