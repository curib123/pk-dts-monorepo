import { Transform } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateDocumentAccessRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  document_id: string;

  @ApiProperty({ maxLength: 1000 })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  request_reason: string;
}
