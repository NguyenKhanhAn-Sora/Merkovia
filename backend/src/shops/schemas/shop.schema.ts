import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ShopDocument = HydratedDocument<Shop>;

/** Loại hình kinh doanh — quyết định có bắt buộc mã số thuế/GPKD hay không. */
export const BUSINESS_TYPES = ['personal', 'household', 'company'] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

/**
 * Trạng thái shop. Chính sách hiện tại: **kiểm duyệt phản ứng** — ai đăng ký
 * cũng bán được ngay (`active`), admin chỉ can thiệp khi vi phạm.
 * - active: hoạt động bình thường (MẶC ĐỊNH khi mở shop).
 * - suspended: bị admin đình chỉ do vi phạm chính sách.
 * - pending: để dành cho trường hợp cần duyệt trước (vd: sau này bắt xác minh
 *   mã số thuế với Hộ KD/Doanh nghiệp). Hiện không dùng khi đăng ký.
 */
export const SHOP_STATUS = ['pending', 'active', 'suspended'] as const;
export type ShopStatus = (typeof SHOP_STATUS)[number];

/** Địa chỉ lấy hàng (kho) của shop — nguồn gửi cho vận chuyển. */
@Schema({ _id: false })
export class PickupAddress {
  @Prop({ trim: true })
  street?: string;

  @Prop({ trim: true })
  ward?: string;

  @Prop()
  wardCode?: number;

  @Prop({ trim: true })
  province?: string;

  /** Mã tỉnh/thành — điểm ĐI để tính cước vận chuyển. */
  @Prop()
  provinceCode?: number;

  /** Toạ độ kho lấy hàng; có thì tính cước theo khoảng cách thật. */
  @Prop()
  lat?: number;

  @Prop()
  lng?: number;

  @Prop({ trim: true, default: 'Việt Nam' })
  country: string;
}
export const PickupAddressSchema = SchemaFactory.createForClass(PickupAddress);

/**
 * Tài khoản ngân hàng nhận tiền bán hàng.
 *
 * 🔴 `accountHolderName` LUÔN lấy từ kết quả tra cứu của ngân hàng, KHÔNG bao
 * giờ nhận từ người bán gõ vào. Cho gõ tay thì gõ sai hoặc khai gian đều lọt,
 * đến lúc chi tiền mới vỡ và tiền đã đi mất.
 *
 * Chỉ tài khoản `verified` mới được nhận tiền. Đổi số tài khoản luôn phải tra
 * cứu lại từ đầu — không có đường nào ghi thẳng trạng thái đã xác thực.
 */
@Schema({ _id: false })
export class BankAccount {
  /** Mã BIN 6 số theo chuẩn VietQR/NAPAS. */
  @Prop({ trim: true, required: true })
  bankBin: string;

  /* Chụp lại tên ngân hàng để hiển thị đúng kể cả khi danh sách đổi về sau. */
  @Prop({ trim: true, required: true })
  bankName: string;

  @Prop({ trim: true, required: true })
  bankCode: string;

  @Prop({ trim: true, required: true, maxlength: 24 })
  accountNumber: string;

  /** Tên chủ tài khoản do NGÂN HÀNG trả về. */
  @Prop({ trim: true, required: true })
  accountHolderName: string;

  /** Tên chủ TK có khớp người đại diện shop không — chỉ để cảnh báo. */
  @Prop({ default: false })
  nameMatchesContact: boolean;

  @Prop({ required: true })
  verifiedAt: Date;

  /** Nhà cung cấp đã xác thực; `mock` = dữ liệu giả lập, không dùng để chi tiền thật. */
  @Prop({ trim: true, required: true })
  verifiedBy: string;
}
export const BankAccountSchema = SchemaFactory.createForClass(BankAccount);

/**
 * Shop — pháp nhân bán hàng, quan hệ 1–1 với User (một tài khoản = một shop).
 * Tách khỏi Profile (thông tin cá nhân) vì shop có vòng đời & quyền riêng.
 */
@Schema({ timestamps: true })
export class Shop {
  /** Chủ shop. unique → mỗi tài khoản chỉ mở được một shop. */
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  owner: Types.ObjectId;

  // Tên shop: chữ (kể cả tiếng Việt), số, dấu cách, '-' và '_'. Tối đa 30.
  @Prop({
    trim: true,
    required: true,
    maxlength: 30,
    match: /^[\p{L}\p{M}\p{N} _-]+$/u,
  })
  name: string;

  /** Handle công khai cho URL shop (merkovia/shop/<slug>). */
  @Prop({ trim: true, lowercase: true, unique: true, sparse: true, maxlength: 40 })
  slug?: string;

  @Prop({ maxlength: 500 })
  description?: string;

  /** Ngành hàng chính (tùy chọn). */
  @Prop({ trim: true })
  category?: string;

  @Prop({ type: String, enum: BUSINESS_TYPES, required: true })
  businessType: BusinessType;

  /** Mã số thuế / GPKD — bắt buộc với hộ KD & doanh nghiệp (validate ở DTO). */
  @Prop({ trim: true })
  taxCode?: string;

  /** Người đại diện liên hệ. */
  @Prop({ trim: true, required: true })
  contactName: string;

  @Prop({ trim: true, required: true })
  contactPhone: string;

  /** Email liên hệ của gian hàng — khác email đăng nhập của tài khoản. */
  @Prop({ trim: true, lowercase: true })
  contactEmail?: string;

  /** Số ngày chuẩn bị hàng trước khi bàn giao cho đơn vị vận chuyển. */
  @Prop({ default: 2, min: 1, max: 7 })
  preparationDays: number;

  /**
   * Người bán tự tạm dừng nhận đơn (đi vắng, hết hàng loạt…).
   * Khác `status: suspended` — cái đó là admin đình chỉ do vi phạm.
   */
  @Prop({ default: false })
  vacationMode: boolean;

  /** Chính sách đổi trả hiển thị cho người mua. */
  @Prop({ maxlength: 1000 })
  returnPolicy?: string;

  /** Lần đổi tên gần nhất — dùng để giới hạn 1 lần / 30 ngày. */
  @Prop()
  nameChangedAt?: Date;

  @Prop({ type: PickupAddressSchema, default: {} })
  pickupAddress: PickupAddress;

  /** Logo shop (đã crop). */
  @Prop()
  logoUrl?: string;

  /** Logo gốc user tải lên (để chỉnh sửa lại sau). */
  @Prop()
  logoOriginalUrl?: string;

  @Prop({ type: Object })
  logoCrop?: Record<string, unknown>;

  /**
   * Lần ĐẦU shop đặt logo riêng. Việc "đã thêm logo" là một việc đã làm, không
   * phải trạng thái hiện tại — quay về logo mặc định sau đó không xoá đi việc
   * đã làm, nên checklist không được bỏ tick.
   */
  @Prop()
  logoSetAt?: Date;

  /**
   * Lần đầu checklist "Hoàn thiện gian hàng" đủ 4/4. Có giá trị = đã xong hẳn,
   * không hiện lại nữa dù về sau shop xoá hết sản phẩm hay đổi lại logo.
   */
  @Prop()
  setupDoneAt?: Date;

  @Prop({ type: String, enum: SHOP_STATUS, default: 'active', index: true })
  status: ShopStatus;

  /** Tài khoản nhận tiền — chưa liên kết thì `undefined`. */
  @Prop({ type: BankAccountSchema })
  bankAccount?: BankAccount;

  /**
   * Lịch sử đổi tài khoản nhận tiền.
   * Đổi số tài khoản là mục tiêu kinh điển của chiếm đoạt tài khoản, nên phải
   * lưu vết để đối soát khi có tranh chấp về tiền.
   */
  @Prop({
    type: [
      {
        _id: false,
        at: Date,
        bankBin: String,
        accountNumber: String,
        accountHolderName: String,
      },
    ],
    default: [],
  })
  bankAccountHistory: {
    at: Date;
    bankBin: string;
    accountNumber: string;
    accountHolderName: string;
  }[];
}

export const ShopSchema = SchemaFactory.createForClass(Shop);
