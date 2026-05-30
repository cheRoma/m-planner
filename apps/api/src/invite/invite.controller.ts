import { BadRequestException, Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { JwtGuard } from "../auth/jwt.guard";
import { InviteService } from "./invite.service";

const AcceptBody = z.object({ token: z.string() });
const RevokeBody = z.object({ token: z.string() });

@Controller()
@UseGuards(JwtGuard)
export class InviteController {
  constructor(private readonly invites: InviteService) {}

  @Post("projects/:id/invite")
  async create(@Param("id") projectId: string) {
    const { token, expiresAt } = await this.invites.create(projectId, 7);
    const link = `https://t.me/${process.env.BOT_USERNAME ?? "mplanner_bot"}?startapp=invite_${token}`;
    return { token, link, expiresAt };
  }

  @Post("invite/accept")
  accept(@Req() req: any, @Body() body: unknown) {
    const parsed = AcceptBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.invites.accept(parsed.data.token, req.userId);
  }

  @Post("invite/revoke")
  async revoke(@Body() body: unknown) {
    const parsed = RevokeBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    await this.invites.revoke(parsed.data.token);
    return { ok: true };
  }
}
