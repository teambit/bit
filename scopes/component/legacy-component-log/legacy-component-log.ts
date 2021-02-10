export type LegacyComponentLog = {
  message: string;
  username?: string;
  email?: string;
  date?: string; // why is this optional?
  hash: string;
  tag?: string; // why is this optional?
};
