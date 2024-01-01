export type CloudUser = {
  displayName?: string;
  username?: string;
  profileImage?: string;
  isLoggedIn?: boolean;
};

export type CloudUserAPIResponse = {
  payload?: {
    displayName?: string;
    username?: string;
    profileImage?: string;
  };
};
