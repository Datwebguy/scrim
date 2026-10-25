import { readJson, requireSession, route } from "@/server/http";
import { createProduct, listProducts } from "@/server/products";

// GET: what you sell over x402, with sales so far. POST: start selling something.
export const GET = route(async () => ({ products: await listProducts(await requireSession()) }));
export const POST = route(async (request) => ({ product: await createProduct(await requireSession(), await readJson(request)) }));
