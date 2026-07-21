import { IsString, Length, Matches } from 'class-validator';

/**
 * Tra cứu / liên kết tài khoản ngân hàng.
 *
 * 🔴 Cố tình KHÔNG nhận `accountHolderName`. Tên chủ tài khoản chỉ được lấy từ
 * kết quả tra cứu của ngân hàng — nhận từ client là mở đường cho khai gian.
 */
export class LookupBankAccountDto {
  /** Mã BIN 6 số theo chuẩn VietQR/NAPAS. */
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã ngân hàng không hợp lệ.' })
  bankBin: string;

  /** Số tài khoản: chỉ chữ số, độ dài theo thực tế các ngân hàng VN. */
  @IsString()
  @Length(6, 24, { message: 'Số tài khoản phải từ 6 đến 24 ký tự.' })
  @Matches(/^\d+$/, { message: 'Số tài khoản chỉ gồm chữ số.' })
  accountNumber: string;
}
