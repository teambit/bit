export type CloudUser = {
  displayName?: string;
  username?: string;
  profileImage?: string;
  isLoggedIn?: boolean;
};

export type CloudUserAPIResponse = {
  data: {
    me: {
      username: string;
      displayName: string;
      image: string;
    };
  };
};
