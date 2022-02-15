export class BuilderData {
  constructor(readonly builderAspectData: any) {}

  getDataByAspect(aspectName: string) {
    const data = this.builderAspectData.aspectsData?.find((aspect) => aspect.aspectId === aspectName);
    return data?.data;
  }

  static fromJson(aspectData: Record<string, any>) {
    return new BuilderData(aspectData);
  }

  static fromString(aspectData: string) {
    return new BuilderData(JSON.parse(aspectData));
  }
}
