import { BadRequestException, ValidationError } from '@nestjs/common';

/**
 * Dịch lỗi kiểm tra dữ liệu sang tiếng Việt.
 *
 * Vì sao cần lớp này: `class-validator` mặc định sinh câu tiếng Anh kiểu
 * "recipientName must be longer than or equal to 2 characters". Câu đó hiện
 * thẳng lên màn hình người dùng Việt Nam thì họ vừa không hiểu, vừa không biết
 * phải sửa ô nào.
 *
 * Cách làm: dịch theo **mã ràng buộc** (`minLength`, `isInt`…) chứ không khớp
 * chuỗi tiếng Anh — mã do class-validator sinh ra ổn định, còn câu chữ thì có
 * thể đổi giữa các phiên bản.
 *
 * Thông báo tự viết trong DTO (`@IsString({ message: '…' })`) LUÔN được giữ
 * nguyên: chúng cụ thể hơn bản dịch chung nên phải thắng.
 */

/** Tên hiển thị của các trường hay gặp; thiếu thì dùng chính tên trường. */
const FIELD_LABELS: Record<string, string> = {
  recipientName: 'Họ tên người nhận',
  recipientPhone: 'Số điện thoại người nhận',
  contactName: 'Tên người liên hệ',
  contactPhone: 'Số điện thoại liên hệ',
  contactEmail: 'Email liên hệ',
  street: 'Địa chỉ chi tiết',
  ward: 'Phường/xã',
  district: 'Quận/huyện',
  province: 'Tỉnh/thành phố',
  city: 'Tỉnh/thành phố',
  country: 'Quốc gia',
  provinceCode: 'Mã tỉnh/thành',
  wardCode: 'Mã phường/xã',
  email: 'Email',
  phone: 'Số điện thoại',
  password: 'Mật khẩu',
  username: 'Tên đăng nhập',
  fullName: 'Họ và tên',
  dateOfBirth: 'Ngày sinh',
  gender: 'Giới tính',
  bio: 'Giới thiệu',
  note: 'Lời nhắn',
  name: 'Tên',
  shopName: 'Tên gian hàng',
  description: 'Mô tả',
  price: 'Giá bán',
  stock: 'Tồn kho',
  quantity: 'Số lượng',
  sku: 'Mã SKU',
  categoryId: 'Danh mục',
  taxCode: 'Mã số thuế',
  accountNumber: 'Số tài khoản',
  bankBin: 'Ngân hàng',
  weightGram: 'Khối lượng',
  paymentMethod: 'Phương thức thanh toán',
  items: 'Giỏ hàng',
  reason: 'Lý do',
  status: 'Trạng thái',
};

/** Lấy con số trong câu mặc định của class-validator (vd "… equal to 2 …"). */
function numberIn(message: string): string {
  return /(-?\d+(?:\.\d+)?)/.exec(message)?.[1] ?? '';
}

const TRANSLATORS: Record<string, (label: string, raw: string) => string> = {
  isNotEmpty: (l) => `${l} không được để trống.`,
  isDefined: (l) => `Thiếu ${l.toLowerCase()}.`,
  isString: (l) => `${l} phải là chuỗi ký tự.`,
  isInt: (l) => `${l} phải là số nguyên.`,
  isNumber: (l) => `${l} phải là số.`,
  isBoolean: (l) => `${l} phải là đúng/sai.`,
  isArray: (l) => `${l} không hợp lệ.`,
  isEmail: (l) => `${l} không đúng định dạng email.`,
  isMongoId: (l) => `${l} không hợp lệ.`,
  isDateString: (l) => `${l} không đúng định dạng ngày.`,
  isLatitude: (l) => `${l} không hợp lệ.`,
  isLongitude: (l) => `${l} không hợp lệ.`,
  isEnum: (l) => `${l} không hợp lệ.`,
  isIn: (l) => `${l} không hợp lệ.`,
  matches: (l) => `${l} chứa ký tự không hợp lệ.`,
  minLength: (l, raw) => `${l} phải có ít nhất ${numberIn(raw)} ký tự.`,
  maxLength: (l, raw) => `${l} tối đa ${numberIn(raw)} ký tự.`,
  length: (l) => `${l} không đúng độ dài cho phép.`,
  min: (l, raw) => `${l} phải từ ${numberIn(raw)} trở lên.`,
  max: (l, raw) => `${l} không được vượt quá ${numberIn(raw)}.`,
  arrayNotEmpty: (l) => `${l} không được để trống.`,
  arrayMinSize: (l, raw) => `${l} cần ít nhất ${numberIn(raw)} mục.`,
  arrayMaxSize: (l, raw) => `${l} tối đa ${numberIn(raw)} mục.`,
  whitelistValidation: (l) => `Trường "${l}" không được phép gửi lên.`,
};

/**
 * Câu mặc định của class-validator luôn có dạng "<property> must/should …".
 * Dựa vào đó để biết đâu là câu tự viết (giữ nguyên) và đâu là câu cần dịch.
 */
function isDefaultEnglish(message: string, property: string): boolean {
  return (
    message.startsWith(`${property} `) ||
    message.startsWith(`each value in ${property} `) ||
    message.startsWith('property ')
  );
}

function labelOf(property: string): string {
  return FIELD_LABELS[property] ?? property;
}

/**
 * Thứ tự ưu tiên khi MỘT trường vi phạm nhiều ràng buộc cùng lúc.
 *
 * Bỏ trống một trường bắt buộc sẽ làm mọi ràng buộc của nó cùng fail: vừa
 * "phải là chuỗi", vừa "ít nhất 2 ký tự", vừa "tối đa 100 ký tự". Đổ hết ra
 * màn hình thì rối, mà câu về độ dài tối đa còn sai nghĩa hoàn toàn. Chỉ giữ
 * câu nền tảng nhất — sửa được nó thì các câu sau tự hết.
 */
const CONSTRAINT_PRIORITY = [
  'isDefined',
  'isNotEmpty',
  'arrayNotEmpty',
  'isString',
  'isInt',
  'isNumber',
  'isBoolean',
  'isArray',
  'isMongoId',
  'isEmail',
  'isDateString',
  'isLatitude',
  'isLongitude',
  'isEnum',
  'isIn',
  'matches',
  'minLength',
  'min',
  'arrayMinSize',
  'maxLength',
  'max',
  'arrayMaxSize',
];

/** Gom mọi lỗi (kể cả lồng nhau) thành danh sách câu tiếng Việt. */
function collect(errors: ValidationError[]): string[] {
  const out: string[] = [];

  for (const error of errors) {
    // Lỗi của object con: bỏ tiền tố kiểu "shippingAddress." vì người dùng chỉ
    // quan tâm ô nào trên màn hình đang sai, không quan tâm cấu trúc payload.
    if (error.children?.length) {
      out.push(...collect(error.children));
    }

    const entries = Object.entries(error.constraints ?? {});
    if (entries.length === 0) continue;

    // 🔴 Sắp theo độ ưu tiên TRƯỚC rồi mới xét câu tự viết. Làm ngược lại thì
    // trường bỏ trống sẽ vớ phải câu của ràng buộc bất kỳ — ví dụ hiện "Tên
    // tỉnh/thành phố quá dài" trong khi người dùng còn chưa chọn gì.
    const rank = (key: string) => {
      const i = CONSTRAINT_PRIORITY.indexOf(key);
      return i === -1 ? CONSTRAINT_PRIORITY.length : i;
    };
    const [key, raw] = entries.sort(([a], [b]) => rank(a) - rank(b))[0];

    // Câu tự viết trong DTO cụ thể hơn bản dịch chung → giữ nguyên.
    if (!isDefaultEnglish(raw, error.property)) {
      out.push(raw);
      continue;
    }

    const translate = TRANSLATORS[key];
    const label = labelOf(error.property);
    out.push(translate ? translate(label, raw) : `${label} không hợp lệ.`);
  }

  // Cùng một câu có thể phát sinh từ nhiều nhánh lồng nhau — chỉ hiện một lần.
  return [...new Set(out)];
}

/**
 * Dùng cho `exceptionFactory` của ValidationPipe.
 * Giữ nguyên hình dạng phản hồi cũ (`message` là mảng chuỗi) để client không
 * phải sửa gì.
 */
export function vietnameseValidationError(
  errors: ValidationError[],
): BadRequestException {
  const messages = collect(errors);
  return new BadRequestException(
    messages.length ? messages : ['Dữ liệu gửi lên không hợp lệ.'],
  );
}
