/**
 * Danh sách ngân hàng Việt Nam theo chuẩn VietQR/NAPAS.
 *
 * `bin` là mã định danh 6 số dùng khi tra cứu tài khoản và tạo mã QR — đây mới
 * là khoá kỹ thuật, `code` chỉ để hiển thị cho người dùng dễ nhận ra.
 *
 * ⚠ Danh sách này là bản chụp phục vụ phát triển. Nguồn chuẩn là API danh sách
 * ngân hàng của nhà cung cấp (VietQR/NAPAS); trước khi chạy thật phải đối chiếu
 * lại, vì ngân hàng có thể đổi tên, sáp nhập hoặc thêm mới.
 */
export interface BankInfo {
  /** Mã BIN 6 số — khoá dùng cho mọi API ngân hàng. */
  bin: string;
  /** Mã ngắn quen thuộc, vd "VCB". */
  code: string;
  /** Tên hiển thị ngắn gọn. */
  shortName: string;
  /** Tên đầy đủ theo đăng ký. */
  name: string;
}

export const BANKS: BankInfo[] = [
  { bin: '970436', code: 'VCB', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' },
  { bin: '970415', code: 'ICB', shortName: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam' },
  { bin: '970418', code: 'BIDV', shortName: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
  { bin: '970405', code: 'VBA', shortName: 'Agribank', name: 'Ngân hàng NN&PTNT Việt Nam' },
  { bin: '970422', code: 'MB', shortName: 'MB Bank', name: 'Ngân hàng TMCP Quân đội' },
  { bin: '970407', code: 'TCB', shortName: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam' },
  { bin: '970416', code: 'ACB', shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { bin: '970432', code: 'VPB', shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { bin: '970423', code: 'TPB', shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  { bin: '970403', code: 'STB', shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { bin: '970437', code: 'HDB', shortName: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP.HCM' },
  { bin: '970441', code: 'VIB', shortName: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam' },
  { bin: '970443', code: 'SHB', shortName: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
  { bin: '970431', code: 'EIB', shortName: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam' },
  { bin: '970426', code: 'MSB', shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải' },
  { bin: '970448', code: 'OCB', shortName: 'OCB', name: 'Ngân hàng TMCP Phương Đông' },
  { bin: '970440', code: 'SEAB', shortName: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á' },
  { bin: '970429', code: 'SCB', shortName: 'SCB', name: 'Ngân hàng TMCP Sài Gòn' },
  { bin: '970427', code: 'VAB', shortName: 'VietABank', name: 'Ngân hàng TMCP Việt Á' },
  { bin: '970428', code: 'NAB', shortName: 'Nam A Bank', name: 'Ngân hàng TMCP Nam Á' },
  { bin: '970419', code: 'NCB', shortName: 'NCB', name: 'Ngân hàng TMCP Quốc Dân' },
  { bin: '970409', code: 'BAB', shortName: 'BacABank', name: 'Ngân hàng TMCP Bắc Á' },
  { bin: '970412', code: 'PVCB', shortName: 'PVcomBank', name: 'Ngân hàng TMCP Đại Chúng Việt Nam' },
  { bin: '970425', code: 'ABB', shortName: 'ABBANK', name: 'Ngân hàng TMCP An Bình' },
  { bin: '970438', code: 'BVB', shortName: 'BaoVietBank', name: 'Ngân hàng TMCP Bảo Việt' },
  { bin: '970433', code: 'VIETBANK', shortName: 'VietBank', name: 'Ngân hàng TMCP Việt Nam Thương Tín' },
  { bin: '970452', code: 'KLB', shortName: 'KienLongBank', name: 'Ngân hàng TMCP Kiên Long' },
  { bin: '970400', code: 'SGICB', shortName: 'SaigonBank', name: 'Ngân hàng TMCP Sài Gòn Công Thương' },
  { bin: '970446', code: 'COOPBANK', shortName: 'Co-op Bank', name: 'Ngân hàng Hợp tác xã Việt Nam' },
  { bin: '970430', code: 'PGB', shortName: 'PGBank', name: 'Ngân hàng TMCP Thịnh vượng và Phát triển' },
  { bin: '970424', code: 'SHBVN', shortName: 'Shinhan Bank', name: 'Ngân hàng TNHH MTV Shinhan Việt Nam' },
  { bin: '970434', code: 'IVB', shortName: 'Indovina Bank', name: 'Ngân hàng TNHH Indovina' },
];

const BY_BIN = new Map(BANKS.map((b) => [b.bin, b]));

export function findBank(bin: string): BankInfo | undefined {
  return BY_BIN.get(bin);
}
