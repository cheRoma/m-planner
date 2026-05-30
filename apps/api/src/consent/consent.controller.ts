import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../auth/jwt.guard";
import { ConsentService } from "./consent.service";

@Controller("consent")
@UseGuards(JwtGuard)
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  @Get() async status(@Req() req: any) {
    return { granted: await this.consent.has(req.userId) };
  }

  @Post() async grant(@Req() req: any) {
    await this.consent.grant(req.userId);
    return { ok: true };
  }
}
