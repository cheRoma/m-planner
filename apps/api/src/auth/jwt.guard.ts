import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException } from "@nestjs/common";
import { verifySession, SessionExpiredError } from "./jwt";

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(@Inject("AUTH_CONFIG") private readonly config: { jwtSecret: string }) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("missing token");
    try {
      const claims = verifySession(header.slice(7), this.config.jwtSecret);
      req.userId = claims.userId;
      return true;
    } catch (e) {
      if (e instanceof SessionExpiredError) throw new UnauthorizedException("session expired");
      throw new UnauthorizedException("invalid token");
    }
  }
}
