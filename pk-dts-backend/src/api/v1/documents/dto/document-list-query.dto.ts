import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentStatus, DocumentType } from '@prisma/client';
import { IsEnum, IsIn, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class DocumentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search title, number, creator, storage fields, folder, or current file name.' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @ApiPropertyOptional({ enum: DocumentType })
  @IsOptional()
  @IsEnum(DocumentType)
  document_type?: DocumentType;

  @ApiPropertyOptional({ enum: DocumentStatus })
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @ApiPropertyOptional({ enum: ['assigned', 'unassigned'] })
  @IsOptional()
  @IsIn(['assigned', 'unassigned'])
  assignment?: 'assigned' | 'unassigned';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  area_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  location_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  specific_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  asset_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  sequence_id?: string;

  @ApiPropertyOptional({ description: 'Filter disposed records by disposer account or manual name.' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  disposed_by?: string;

  @ApiPropertyOptional({ description: 'Softcopy category. Parent folders include descendants.' })
  @IsOptional()
  @IsNumberString()
  category_id?: string;
}
