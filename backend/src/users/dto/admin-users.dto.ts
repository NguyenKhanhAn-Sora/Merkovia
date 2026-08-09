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

export const LOCK_SCOPES = ['buyer', 'seller', 'all'] as const;
export type LockScope = (typeof LOCK_SCOPES)[number];

/**
 * Khoá tài khoản — bắt buộc ghi lý do, gửi thẳng cho người dùng qua email vì
 * họ không đăng nhập được để xem trong app. `scope` quyết định khoá riêng vai
 * trò mua (`buyer`), vai trò bán (`seller`, chặn đăng nhập app seller — khác
 * "đình chỉ gian hàng" vốn vẫn cho đăng nhập), hay toàn bộ tài khoản (`all`).
 */
export class LockUserDto {
  @IsString()
  @MinLength(5, {
    message: 'Vui lòng nêu lý do khoá tài khoản (ít nhất 5 ký tự).',
  })
  @MaxLength(500)
  reason: string;

  @IsIn(LOCK_SCOPES)
  scope: LockScope;
}

export class UnlockUserDto {
  @IsIn(LOCK_SCOPES)
  scope: LockScope;
}
