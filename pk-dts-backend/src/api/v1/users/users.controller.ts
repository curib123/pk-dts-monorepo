import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { RequirePermissions } from "../../../common/auth/require-permissions.decorator";
import { AllowSelf } from "../../../common/auth/allow-self.decorator";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { AuthenticatedUser } from "../../../common/auth/authenticated-user.interface";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

@ApiTags("Users")
@Controller({ path: "users", version: "1" })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions("user-accounts.view")
  @ApiOperation({ summary: "List users" })
  @ApiOkResponse({ description: "Users retrieved successfully." })
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get("me")
  @ApiOperation({ summary: "Get the signed-in user's account details" })
  @ApiOkResponse({ description: "Current user retrieved successfully." })
  findCurrent(@CurrentUser() user?: AuthenticatedUser) {
    return this.usersService.findOne(user?.user_id ?? "");
  }

  @Get(":id")
  @RequirePermissions("user-accounts.view")
  @ApiOperation({ summary: "Get user details" })
  @ApiOkResponse({ description: "User retrieved successfully." })
  findOne(@Param("id") id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @RequirePermissions("user-accounts.create", "user-accounts.manage")
  @ApiOperation({ summary: "Create user" })
  @ApiCreatedResponse({ description: "User created successfully." })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(":id")
  @AllowSelf()
  @RequirePermissions("user-accounts.edit", "user-accounts.manage")
  @ApiOperation({ summary: "Update user" })
  @ApiOkResponse({ description: "User updated successfully." })
  update(@Param("id") id: string, @Body() dto: UpdateUserDto, @CurrentUser() user?: AuthenticatedUser) {
    const permissions = new Set(user?.role.permissions ?? []);
    const canManageAccounts = permissions.has("user-accounts.edit") || permissions.has("user-accounts.manage");
    const isSelf = String(user?.user_id ?? "") === String(id);

    if (isSelf && !canManageAccounts) {
      const {
        role_id: _ignoredRoleId,
        leader_id: _ignoredLeaderId,
        ...safeProfileChanges
      } = dto;
      return this.usersService.update(id, safeProfileChanges);
    }

    return this.usersService.update(id, dto);
  }

  @Delete(":id")
  @RequirePermissions("user-accounts.delete", "user-accounts.manage")
  @ApiOperation({ summary: "Delete user" })
  @ApiOkResponse({ description: "User deleted successfully." })
  remove(@Param("id") id: string) {
    return this.usersService.remove(id);
  }
}
