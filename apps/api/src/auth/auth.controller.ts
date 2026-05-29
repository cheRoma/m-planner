import { Body, Controller, Post, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { InitDataError } from "./init-data";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("telegram")
  async telegram(@Body() body: { initData?: string }) {
    if (!body?.initData) throw new UnauthorizedException("missing initData");
    try {
      return await this.auth.login(body.initData);
    } catch (e) {
      if (e instanceof InitDataError) throw new UnauthorizedException(e.message);
      throw e;
    }
  }
}
