export type AspectDataEntry = {
  aspectId: string;
  aspectData: Record<any, any>;
};

export type AspectDataEntryJson = {
  aspectId: string;
  aspectData: string;
};

export type AspectListProps = {
  entries?: AspectDataEntry[];
};

export type AspectListPropsJson = {
  entries?: AspectDataEntryJson[];
};

export class AspectList {
  constructor(readonly entries: AspectDataEntry[]) {}

  get<T>(aspectId: string): T | undefined {
    const aspectEntry = this.entries.find((entry) => entry.aspectId === aspectId);
    if (!aspectEntry) return undefined;
    return aspectEntry.aspectData as T;
  }

  toObject(): AspectListProps {
    return {
      entries: this.entries,
    };
  }

  static fromObject(obj?: AspectListProps) {
    const entries = obj?.entries || [];
    return new AspectList(entries);
  }

  static fromJson(obj?: AspectListPropsJson) {
    const entries =
      obj?.entries?.map(({ aspectId, aspectData }) => {
        return {
          aspectId,
          aspectData: JSON.parse(aspectData),
        };
      }) || [];
    return new AspectList(entries);
  }
}
