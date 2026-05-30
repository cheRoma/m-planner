import { ConflictException } from "@nestjs/common";

interface VersionedDelegate {
  updateMany(args: { where: any; data: any }): Promise<{ count: number }>;
  findUniqueOrThrow(args: { where: { id: string } }): Promise<any>;
}

/**
 * §12.6: optimistic lock on financial rows. UPDATE ... WHERE id AND version;
 * 0 rows affected → someone edited concurrently → 409 (client must reload).
 */
export async function updateWithVersion<T>(
  delegate: VersionedDelegate, id: string, expectedVersion: number, data: Record<string, unknown>,
): Promise<T> {
  const res = await delegate.updateMany({
    where: { id, version: expectedVersion },
    data: { ...data, version: { increment: 1 } },
  });
  if (res.count === 0) throw new ConflictException("данные изменились, обновите и повторите");
  return delegate.findUniqueOrThrow({ where: { id } }) as Promise<T>;
}
