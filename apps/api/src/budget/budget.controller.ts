import { Body, Controller, Delete, Param, Patch, Post, UseGuards, BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { JwtGuard } from "../auth/jwt.guard";
import { BudgetService } from "./budget.service";
import { PaymentService } from "./payment.service";

const AddItem = z.object({ categoryId: z.string(), plannedAmount: z.string(), vendorName: z.string().optional() });
const PatchItem = z.object({ version: z.number().int(), plannedAmount: z.string().optional(), vendorName: z.string().optional(), status: z.string().optional() });
const AddPayment = z.object({ type: z.enum(["prepay", "balance", "full"]), amount: z.string(), payer: z.enum(["couple", "parents", "other"]), dueDate: z.string().optional(), paidAt: z.string().optional() });

@Controller()
@UseGuards(JwtGuard)
export class BudgetController {
  constructor(private readonly budget: BudgetService, private readonly payments: PaymentService) {}

  @Post("projects/:id/items")
  addItem(@Param("id") projectId: string, @Body() body: unknown) {
    const parsed = AddItem.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.budget.addItem(projectId, parsed.data);
  }

  @Patch("items/:itemId")
  patchItem(@Param("itemId") itemId: string, @Body() body: unknown) {
    const parsed = PatchItem.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { version, ...patch } = parsed.data;
    return this.budget.updateItem(itemId, version, patch);
  }

  @Post("items/:itemId/payments")
  addPayment(@Param("itemId") itemId: string, @Body() body: unknown) {
    const parsed = AddPayment.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.payments.addPayment(itemId, parsed.data);
  }

  @Delete("payments/:paymentId")
  deletePayment(@Param("paymentId") paymentId: string) {
    return this.payments.deletePayment(paymentId);
  }
}
