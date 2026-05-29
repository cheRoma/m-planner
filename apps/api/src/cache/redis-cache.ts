import { Injectable, Inject } from "@nestjs/common";
import type Redis from "ioredis";

@Injectable()
export class RedisCache {
  constructor(@Inject("REDIS") private readonly redis: Redis) {}

  async getOrSet<T>(key: string, ttlSec: number, compute: () => Promise<T>): Promise<T> {
    const hit = await this.redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
    const value = await compute();
    await this.redis.set(key, JSON.stringify(value), "EX", ttlSec);
    return value;
  }

  async del(key: string): Promise<void> { await (this.redis as any).del(key); }
}
