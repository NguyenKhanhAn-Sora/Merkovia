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
