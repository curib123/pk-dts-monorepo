import { Body, Controller, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { AuthenticatedUser } from "../../../common/auth/authenticated-user.interface";
import { RequirePermissions } from "../../../common/auth/require-permissions.decorator";
import { CreateWorkflowDefinitionDto } from "./dto/create-workflow-definition.dto";
import { CreateWorkflowVersionDto } from "./dto/create-workflow-version.dto";
import { UpdateWorkflowVersionDto } from "./dto/update-workflow-version.dto";
import { assertSequentialWorkflowGraph } from "./sequential-workflow.validator";
import { WorkflowDefinitionsService } from "./workflow-definitions.service";

@Controller({ path: "workflow-definitions", version: "1" })
export class WorkflowDefinitionsController {
  constructor(private readonly service: WorkflowDefinitionsService) {}

  @Get()
  @RequirePermissions("document-workflow.view", "document-workflow.configure")
  list(@Query("include_inactive") includeInactive?: string) { return this.service.list(includeInactive === "true"); }

  @Get("published-default")
  @RequirePermissions("document-requests.create", "document-workflow.view", "document-workflow.configure")
  publishedDefault(@Query("document_type") documentType: string, @Query("action_requested") action?: string) {
    return this.service.publishedDefault(documentType, action);
  }

  @Get("published")
  @RequirePermissions("document-requests.create", "document-workflow.view", "document-workflow.configure")
  published(@Query("document_type") documentType?: string) { return this.service.published(documentType); }

  @Post()
  @RequirePermissions("document-workflow.configure")
  create(@Body() dto: CreateWorkflowDefinitionDto, @CurrentUser() user: AuthenticatedUser) {
    assertSequentialWorkflowGraph(dto.graph);
    return this.service.create(dto, user);
  }

  @Post(":id/versions")
  @RequirePermissions("document-workflow.configure")
  createVersion(@Param("id") id: string, @Body() dto: CreateWorkflowVersionDto, @CurrentUser() user: AuthenticatedUser) {
    if (dto.graph !== undefined) assertSequentialWorkflowGraph(dto.graph);
    return this.service.createVersion(id, dto, user);
  }

  @Put(":id/versions/:versionId")
  @RequirePermissions("document-workflow.configure")
  updateVersion(@Param("id") id: string, @Param("versionId") versionId: string, @Body() dto: UpdateWorkflowVersionDto) {
    assertSequentialWorkflowGraph(dto.graph);
    return this.service.updateVersion(id, versionId, dto);
  }

  @Post(":id/versions/:versionId/publish")
  @RequirePermissions("document-workflow.publish")
  publish(@Param("id") id: string, @Param("versionId") versionId: string, @CurrentUser() user: AuthenticatedUser) { return this.service.publish(id, versionId, user); }

  @Patch(":id/active")
  @RequirePermissions("document-workflow.configure")
  setActive(@Param("id") id: string, @Body() body: { is_active: boolean }) { return this.service.setActive(id, body.is_active === true); }
}
