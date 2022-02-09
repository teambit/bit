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
    const aspectEntry = this.entries.find((entry) => entry.aspectId === aspectId);
    if (!aspectEntry) return undefined;
    return JSON.parse(aspectEntry.aspectData) as T;
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
