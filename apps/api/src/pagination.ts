import { z } from "zod";

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export function pageRequest(query: Record<string, string>, total: number) {
  const request = pageSchema.parse({ page: query.page, limit: query.limit });
  const pages = Math.max(1, Math.ceil(total / request.limit));
  const page = Math.min(request.page, pages);
  return {
    page,
    pages,
    total,
    limit: request.limit,
    skip: (page - 1) * request.limit,
  };
}
