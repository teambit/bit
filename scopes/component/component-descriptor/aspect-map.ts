export type AspectDataEntry = {
  aspectId: string;
  aspectData: Record<any, any>;
};

export type AspectDataEntryJson = {
  aspectId: string;
  aspectData: string;
};

export type AspectMapProps = {
  entries?: AspectDataEntry[];
};

export type AspectMapPropsJson = {
  entries?: AspectDataEntryJson[];
};

export class AspectMap {
  constructor(private entries: AspectDataEntry[]) {}

  get<T>(aspectId: string): T | undefined {
    const aspectEntry = this.entries.find((entry) => entry.aspectId === aspectId);
    if (!aspectEntry) return undefined;
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

  static fromJson(obj?: AspectMapPropsJson) {
    const entries =
      obj?.entries?.map(({ aspectId, aspectData }) => {
        return {
          aspectId,
          aspectData: JSON.parse(aspectData),
        };
      }) || [];
    return new AspectMap(entries);
  }
}
