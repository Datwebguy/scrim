import { route } from "@/server/http";
import { publicLink } from "@/server/paylinks";

// Public. Anyone with the link can see what is being asked, and nothing else.
export const GET = route<{ code: string }>(async (_r, { code }) => ({ link: await publicLink(code) }));
