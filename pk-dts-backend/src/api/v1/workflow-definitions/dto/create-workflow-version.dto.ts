import { ApiProperty } from "@nestjs/swagger";
import { IsObject } from "class-validator";

export class CreateWorkflowVersionDto {
  @ApiProperty({ description: "Explicit sequential approval route for the new immutable-version draft." })
  @IsObject()
  graph!: Record<string, unknown>;
}
