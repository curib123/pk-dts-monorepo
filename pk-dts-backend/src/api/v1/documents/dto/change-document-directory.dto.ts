import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ChangeDocumentDirectoryDto {
  @ApiProperty({ example: '12', description: 'Active softcopy folder or subfolder ID.' })
  @IsString()
  @IsNotEmpty()
  softcopy_category_id: string;
}
