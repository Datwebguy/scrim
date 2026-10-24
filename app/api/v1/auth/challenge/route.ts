import { createSignInChallenge } from "@/server/auth";
import { route } from "@/server/http";

export const POST = route(async () => createSignInChallenge());
