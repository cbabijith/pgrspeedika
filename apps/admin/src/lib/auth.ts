"use client";

import { createPgrsAuthClient } from "@pgrs/auth/client";
import { API_URL } from "./api";

export const authClient = createPgrsAuthClient(API_URL);
