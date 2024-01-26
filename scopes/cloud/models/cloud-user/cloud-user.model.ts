export type CloudUser = {
  displayName?: string;
  username?: string;
  profileImage?: string;
  isLoggedIn?: boolean;
};

export type CloudUserAPIResponse = {
  payload?: {
    displayName?: string | null;
    username?: string | null;
    profileImage?: string | null;
  };
};
