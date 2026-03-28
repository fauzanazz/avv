export interface GitHubConfig {
  token: string;
  username?: string;
  validated: boolean;
}

export interface Settings {
  github?: GitHubConfig;
  theme?: "dark" | "light";
}
