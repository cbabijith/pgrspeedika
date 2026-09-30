import { Hono } from "hono";
import type { SessionUser } from "./context";

/** Variables every route in this app can read from the context. */
export interface PgrsVariables {
  user: SessionUser;
  requestId: string;
  ip: string;
}

export type PgrsHono = Hono<{ Variables: PgrsVariables }>;

/** Create a router with the shared context typing. */
export function newHono(): PgrsHono {
  return new Hono<{ Variables: PgrsVariables }>();
}
