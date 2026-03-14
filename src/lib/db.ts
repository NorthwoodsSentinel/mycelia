import type { PaginationParams, PaginatedResult } from '../types';

/**
 * Execute a paginated query against D1.
 */
export async function paginatedQuery<T>(
  db: D1Database,
  query: string,
  countQuery: string,
  params: unknown[],
  pagination: PaginationParams
): Promise<PaginatedResult<T>> {
  const offset = (pagination.page - 1) * pagination.limit;

  const [results, countResult] = await Promise.all([
    db.prepare(`${query} LIMIT ? OFFSET ?`)
      .bind(...params, pagination.limit, offset)
      .all<T>(),
    db.prepare(countQuery)
      .bind(...params)
      .first<{ count: number }>()
  ]);

  const total = countResult?.count ?? 0;

  return {
    items: results.results,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      has_more: offset + pagination.limit < total
    }
  };
}

/**
 * Parse pagination params from query string with defaults.
 */
export function parsePagination(query: Record<string, string>): PaginationParams {
  return {
    page: Math.max(1, parseInt(query.page || '1', 10)),
    limit: Math.min(50, Math.max(1, parseInt(query.limit || '20', 10))),
    sort: query.sort
  };
}
