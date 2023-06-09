export type LegacyComponentLog = {
  message: string;
  username?: string;
  displayName?: string;
  email?: string;
  date?: string;
  hash: string;
  tag?: string;
  parents: string[];
  onLane?: boolean;
};
