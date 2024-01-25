export type CloudUser = {
  displayName?: string | null;
  username?: string | null;
  profileImage?: string | null;
  isLoggedIn?: boolean;
};

export type CloudUserAPIResponse = {
  payload?: {
    displayName?: string | null;
    username?: string | null;
    profileImage?: string | null;
  };
};
