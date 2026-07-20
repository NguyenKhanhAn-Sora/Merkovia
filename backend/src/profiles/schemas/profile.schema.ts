import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProfileDocument = HydratedDocument<Profile>;

export const GENDERS = ['male', 'female', 'other', 'undisclosed'] as const;
export type Gender = (typeof GENDERS)[number];

/**
 * Profile — thông tin hiển thị của người dùng, quan hệ 1–1 với User.
 * Hầu hết field là tùy chọn (điền dần sau khi đăng ký).
 */
@Schema({ timestamps: true })
export class Profile {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  user: Types.ObjectId;

  /** Họ và tên — một field duy nhất. Tối đa 30 ký tự, không ký tự đặc biệt. */
  @Prop({ trim: true, maxlength: 30, match: /^[\p{L}\p{M}\s]+$/u })
  fullName?: string;

  /** Tên hiển thị (không cần unique). Cùng ràng buộc như fullName. */
  @Prop({ trim: true, maxlength: 30, match: /^[\p{L}\p{M}\s]+$/u })
  displayName?: string;

  /**
   * Handle duy nhất cho URL hồ sơ/đánh giá — tùy chọn.
   * Tối đa 20 ký tự; chỉ chữ/số/./_ ; không bắt đầu bằng . hoặc _.
   */
  @Prop({
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true,
    maxlength: 20,
    match: /^[a-zA-Z0-9][a-zA-Z0-9._]*$/,
  })
  username?: string;

  /** Ảnh hiển thị (đã crop). */
  @Prop()
  avatarUrl?: string;

  /** Ảnh gốc do user tải lên (để chỉnh sửa lại avatar sau này). */
  @Prop()
  avatarOriginalUrl?: string;

  /** Thông số crop (zoom, vị trí) để tái tạo avatar khi chỉnh sửa. */
  @Prop({ type: Object })
  avatarCrop?: Record<string, unknown>;

  @Prop()
  dateOfBirth?: Date;

  @Prop({ type: String, enum: GENDERS })
  gender?: Gender;

  @Prop({ maxlength: 200 })
  bio?: string;

  @Prop({ default: 'vi' })
  locale: string;
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);
