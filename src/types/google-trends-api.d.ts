declare module "google-trends-api" {
  interface TrendsQuery {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string | string[];
    hl?: string;
    category?: number;
    granularTimeResolution?: boolean;
  }

  const googleTrends: {
    interestOverTime(query: TrendsQuery): Promise<string>;
    relatedQueries(query: TrendsQuery): Promise<string>;
  };

  export default googleTrends;
}
