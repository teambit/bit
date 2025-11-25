export type LegacyComponentLog = {
  message: string;
  username?: string;
  displayName?: string;
  email?: string;
  date?: string;
  hash: string;
  tag?: string;
  parents: string[];
  profileImage?: string;
  onLane?: boolean;
  deleted?: boolean;
  deprecated?: boolean;
  hidden?: boolean;
};
