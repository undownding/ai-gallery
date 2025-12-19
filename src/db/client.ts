import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type EnvWithDb = {
  db: D1Database;
};

export function getDb(env: EnvWithDb) {
  return drizzle(env.db, { schema });
}

export type DB = ReturnType<typeof getDb>;
