export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  children?: FileEntry[];
}

export type FileAction = "created" | "updated" | "deleted";
