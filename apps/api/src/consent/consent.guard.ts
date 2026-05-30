import { CanActivate, ExecutionContext, Injectable, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ConsentService } from "./consent.service";

/**
 * 152-ФЗ: block personal-data processing (project creation) until the user has
 * granted consent. Runs AFTER JwtGuard (which sets req.userId). Returns 403 if
 * consent is absent — closes the gap where a direct API caller bypasses the
 * Mini App's client-side consent check.
 */
@Injectable()
export class ConsentGuard implements CanActivate {
  constructor(private readonly consent: ConsentService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.userId;
    // Defensive: ConsentGuard must be listed after JwtGuard so userId is set.
    if (!userId) throw new UnauthorizedException("missing authenticated user");
    if (!(await this.consent.has(userId))) {
      throw new ForbiddenException("consent required (152-FZ): grant consent before creating a project");
    }
    return true;
  }
}
