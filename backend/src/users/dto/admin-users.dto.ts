import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QueryAdminUsersDto {
  @IsOptional()
  @IsIn(['all', 'buyer', 'seller', 'locked'])
  tab?: 'all' | 'buyer' | 'seller' | 'locked';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Khoá tài khoản — bắt buộc ghi lý do, gửi thẳng cho người dùng qua email vì họ không đăng nhập được để xem trong app. */
export class LockUserDto {
  @IsString()
  @MinLength(5, {
    message: 'Vui lòng nêu lý do khoá tài khoản (ít nhất 5 ký tự).',
  })
  @MaxLength(500)
  reason: string;
}
