import type { Prisma } from '@prismaClient';

/**
 * Minimal lower bound for a Prisma model delegate. It exists only so `Prisma.Args` / `Prisma.Result`
 * can resolve against the concrete delegate inferred at each call site — the real (per-model) types
 * are recovered through those operators.
 */
interface PaginableDelegate {
  findMany: (args: never) => Prisma.PrismaPromise<unknown[]>;
  count: (args: never) => Prisma.PrismaPromise<number>;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 10;

export interface PaginatedResult<T> {
  total: number;
  items: T;
}

/**
 * Runs a paginated `findMany` and a matching `count` in parallel and returns `{ total, items }`.
 * @param delegate - a Prisma model delegate (`prisma.job`, `prisma.stage`, `prisma.task`, ...)
 * @param args - `findMany` args; `take` and `skip` are injected from `page` / `pageSize`
 * @param page - 1-based page number (defaults to {@link DEFAULT_PAGE})
 * @param pageSize - number of items per page (defaults to {@link DEFAULT_PAGE_SIZE})
 */
export async function paginate<Delegate extends PaginableDelegate, Args extends Prisma.Args<Delegate, 'findMany'>>(
  delegate: Delegate,
  args: Args,
  page: number = DEFAULT_PAGE,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<PaginatedResult<Prisma.Result<Delegate, Args, 'findMany'>>> {
  const skip = (page - 1) * pageSize;
  const findManyArgs = { ...(args as Record<string, unknown>), take: pageSize, skip };
  const countArgs = { where: (args as { where?: unknown }).where };

  const [items, total] = await Promise.all([delegate.findMany(findManyArgs as never), delegate.count(countArgs as never)]);

  return { total, items: items as Prisma.Result<Delegate, Args, 'findMany'> };
}
