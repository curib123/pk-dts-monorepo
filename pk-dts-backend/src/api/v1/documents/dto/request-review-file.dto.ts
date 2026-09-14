import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class RequestReviewFileDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  revision_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason_of_revision?: string;

  @IsOptional()
  @IsDateString()
  effective_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  page_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  series_number?: string;

  @IsOptional()
  @IsString()
  softcopy_category_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  revision_level_from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  revision_level_to?: string;

  @IsOptional()
  @IsDateString()
  previous_effective_date?: string;

  @IsOptional()
  @IsDateString()
  new_effective_date?: string;
}
