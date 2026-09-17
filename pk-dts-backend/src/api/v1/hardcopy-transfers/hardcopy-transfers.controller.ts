import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { RequirePermissions } from "../../../common/auth/require-permissions.decorator";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { AuthenticatedUser } from "../../../common/auth/authenticated-user.interface";
import { WorkflowActionDto } from "../documents/dto/workflow-action.dto";
import { CreateHardcopyTransferDto } from "./dto/create-hardcopy-transfer.dto";
import { HardcopyTransfersService } from "./hardcopy-transfers.service";

@Controller({ path: "hardcopy-transfers", version: "1" })
export class HardcopyTransfersController {
  constructor(private readonly service: HardcopyTransfersService) {}

  @Post()
  @RequirePermissions("hardcopy-transfers.create")
  create(@Body() dto: CreateHardcopyTransferDto, @CurrentUser() user: AuthenticatedUser) { return this.service.create(dto, user); }

  @Get("mine")
  @RequirePermissions("hardcopy-transfers.view-own")
  mine(@CurrentUser() user: AuthenticatedUser) { return this.service.listMine(user); }

  @Get("pending")
  @RequirePermissions("hardcopy-transfers.review")
  pending(@CurrentUser() user: AuthenticatedUser) { return this.service.listPending(user); }

  @Post(":id/submit")
  @RequirePermissions("hardcopy-transfers.create")
  submit(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.submit(id, user); }

  @Post(":id/approve")
  @RequirePermissions("hardcopy-transfers.approve")
  approve(@Param("id") id: string, @Body() dto: WorkflowActionDto, @CurrentUser() user: AuthenticatedUser) { return this.service.approve(id, user, dto.remarks); }

  @Post(":id/return")
  @RequirePermissions("hardcopy-transfers.approve")
  returnForCorrection(@Param("id") id: string, @Body() dto: WorkflowActionDto, @CurrentUser() user: AuthenticatedUser) { return this.service.returnForCorrection(id, user, dto.remarks); }

  @Post(":id/reject")
  @RequirePermissions("hardcopy-transfers.approve")
  reject(@Param("id") id: string, @Body() dto: WorkflowActionDto, @CurrentUser() user: AuthenticatedUser) { return this.service.reject(id, user, dto.remarks); }

  @Post(":id/resubmit")
  @RequirePermissions("hardcopy-transfers.create")
  resubmit(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.resubmit(id, user); }

  @Post(":id/cancel")
  @RequirePermissions("hardcopy-transfers.create")
  cancel(@Param("id") id: string, @Body() dto: WorkflowActionDto, @CurrentUser() user: AuthenticatedUser) { return this.service.cancel(id, user, dto.remarks); }

  @Post(":id/for-transfer")
  @RequirePermissions("hardcopy-transfers.dispatch")
  forTransfer(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.markForTransfer(id, user); }

  @Post(":id/dispatch")
  @RequirePermissions("hardcopy-transfers.dispatch")
  dispatch(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.dispatch(id, user); }

  @Post(":id/await-acceptance")
  @RequirePermissions("hardcopy-transfers.dispatch")
  awaitAcceptance(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.awaitAcceptance(id, user); }

  @Post(":id/complete")
  @RequirePermissions("hardcopy-transfers.create")
  complete(@Param("id") id: string, @Body() dto: WorkflowActionDto, @CurrentUser() user: AuthenticatedUser) { return this.service.complete(id, user, dto.remarks); }

  @Post(":id/accept")
  @RequirePermissions("hardcopy-transfers.accept")
  accept(@Param("id") id: string, @Body() dto: WorkflowActionDto, @CurrentUser() user: AuthenticatedUser) { return this.service.accept(id, user, dto.remarks); }
}
