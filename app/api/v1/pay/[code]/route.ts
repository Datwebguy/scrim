import { route } from "@/server/http";
import { publicLink } from "@/server/paylinks";
import { productInfo } from "@/server/products";

// Public. Anyone with the link can see what is being asked (and, for a product, what it is), nothing else.
export const GET = route<{ code: string }>(async (_r, { code }) => ({ link: await publicLink(code), product: await productInfo(code) }));
