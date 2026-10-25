import { requireSession, route } from "@/server/http";
import { listSales, stopSelling } from "@/server/products";

// GET: each sale of this product. DELETE: stop selling it (sales so far are kept).
export const GET = route<{ code: string }>(async (_r, { code }) => ({ sales: await listSales(await requireSession(), code) }));
export const DELETE = route<{ code: string }>(async (_r, { code }) => {
  await stopSelling(await requireSession(), code);
  return { stopped: true };
});
