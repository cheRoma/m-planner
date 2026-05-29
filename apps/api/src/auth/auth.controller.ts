import { Body, Controller, Logger, Post, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { InitDataError } from "./init-data";

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly auth: AuthService) {}

  @Post("telegram")
  async telegram(@Body() body: { initData?: string }) {
    if (!body?.initData) throw new UnauthorizedException("missing initData");
    try {
      return await this.auth.login(body.initData);
    } catch (e) {
      if (e instanceof InitDataError) {
        // Log the specific reason server-side; do not leak it to the client (oracle).
        this.logger.warn(`initData verification failed: ${e.message}`);
        throw new UnauthorizedException("invalid initData");
      }
      throw e;
    }
  }
}
