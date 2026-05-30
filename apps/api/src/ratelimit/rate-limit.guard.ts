import { CanActivate, ExecutionContext, Injectable, Inject, HttpException, HttpStatus } from "@nestjs/common";
import type Redis from "ioredis";

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject("REDIS") private readonly redis: Redis,
    @Inject("RATELIMIT_CONFIG") private readonly config: { limit: number; windowSec: number },
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const ip = req.ip ?? req.headers?.["x-forwarded-for"] ?? "unknown";
    const path = req.route?.path ?? req.url ?? "?";
    const windowId = Math.floor(Date.now() / 1000 / this.config.windowSec);
    const key = `rl:${path}:${ip}:${windowId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, this.config.windowSec);
    if (count > this.config.limit) throw new HttpException("rate limit exceeded", HttpStatus.TOO_MANY_REQUESTS);
    return true;
  }
}
