import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export const USER_ROLES = ['buyer', 'seller', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUS = ['active', 'pending', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUS)[number];

/**
 * User — danh tính & bảo mật. Giữ gọn, tách khỏi thông tin hiển thị (Profile).
 * email/phone unique + sparse: cho phép tồn tại tài khoản chỉ-email hoặc chỉ-phone.
 */
@Schema({ timestamps: true })
export class User {
  @Prop({ trim: true, lowercase: true, unique: true, sparse: true })
  email?: string;

  @Prop({ trim: true, unique: true, sparse: true })
  phone?: string;

  /** Chỉ có với tài khoản đăng nhập bằng email (login SĐT là OTP-only). */
  @Prop()
  passwordHash?: string;

  @Prop({ default: false })
  emailVerified: boolean;

  @Prop({ default: false })
  phoneVerified: boolean;

  @Prop({ type: [String], enum: USER_ROLES, default: ['buyer'] })
  roles: UserRole[];

  @Prop({ type: String, enum: USER_STATUS, default: 'active' })
  status: UserStatus;

  /**
   * Khoá riêng theo VAI TRÒ — tách khỏi `status` (dành cho vấn đề DANH TÍNH:
   * gian lận đăng nhập, lộ mật khẩu, yêu cầu pháp lý — khoá cả hai app).
   * `buyerLocked` chặn đăng nhập app người MUA, `sellerLocked` chặn đăng nhập
   * app người BÁN — một tài khoản vừa mua vừa bán bị cấm vì hành vi MUA hàng
   * (vd lạm dụng hoàn trả) không nên kéo theo mất luôn quyền vận hành shop
   * đang hoạt động bình thường của họ, và ngược lại.
   */
  @Prop({ default: false })
  buyerLocked: boolean;

  @Prop({ default: false })
  sellerLocked: boolean;

  /** Đăng nhập mạng xã hội (Google…), để mở rộng sau. */
  @Prop({
    type: [{ provider: String, providerId: String, _id: false }],
    default: [],
  })
  authProviders: { provider: string; providerId: string }[];

  /**
   * Tăng lên mỗi khi cần vô hiệu hoá TẤT CẢ token đã phát (đổi mật khẩu,
   * đăng xuất mọi thiết bị). JWT mang `tv`; guard so khớp với giá trị này.
   */
  @Prop({ default: 0 })
  tokenVersion: number;

  @Prop()
  lastLoginAt?: Date;

  /** Lần cuối còn kết nối socket — để hiện "đang hoạt động / hoạt động N phút trước". */
  @Prop()
  lastActiveAt?: Date;

  /** Xoá mềm. */
  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Trang Kênh Quản trị luôn lọc theo deletedAt rồi sort createdAt mới nhất;
// dashboard admin cũng đếm `countDocuments({ deletedAt: null })` mỗi lần tải.
UserSchema.index({ deletedAt: 1, createdAt: -1 });
