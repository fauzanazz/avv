import type { FileStorage } from "./types";
import { R2Storage } from "./r2";
import { LocalStorage } from "./local";

export type { FileStorage } from "./types";

export const isProduction = process.env.NODE_ENV === "production";

export const storage: FileStorage = isProduction
  ? new R2Storage()
  : new LocalStorage();
