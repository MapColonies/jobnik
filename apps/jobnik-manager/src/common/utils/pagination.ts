/** The page returned when a search doesn't specify one */
export const DEFAULT_PAGE = 1;

export interface PaginatedResult<T> {
  total: number;
  items: T;
}
