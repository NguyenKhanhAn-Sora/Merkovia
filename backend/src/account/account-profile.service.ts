import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Profile, ProfileDocument } from '../profiles/schemas/profile.schema';
import { Address, AddressDocument } from '../addresses/schemas/address.schema';
import {
  ChangePhoneDto,
  SaveAddressDto,
  SendPhoneCodeDto,
  UpdateProfileDto,
} from './dto/account.dto';
import { normalizePhone } from '../common/phone';
import { AuthService, OTP_VERIFY_MESSAGES } from '../auth/auth.service';
import type { UserDocument } from '../users/schemas/user.schema';

/** Người mua chỉ nên có số địa chỉ vừa phải — nhiều quá là dấu hiệu bị lạm dụng. */
const MAX_ADDRESSES = 15;

/**
 * Hồ sơ cá nhân và sổ địa chỉ của người mua.
 *
 * Trước đây địa chỉ CHỈ được tạo một lần lúc đăng ký và không có đường nào sửa
 * — trang thanh toán đọc từ đó nhưng người mua chuyển nhà thì chịu. Đây là chỗ
 * bù lại lỗ hổng ấy.
 */
@Injectable()
export class AccountProfileService {
  constructor(
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
    @InjectModel(Address.name)
    private readonly addressModel: Model<AddressDocument>,
    private readonly auth: AuthService,
  ) {}

  /* ------------------------------- Hồ sơ -------------------------------- */

  async getMe(user: UserDocument) {
    const profile = await this.profileModel.findOne({ user: user._id });
    return {
      account: {
        id: String(user._id),
        email: user.email,
        phone: user.phone,
        roles: user.roles,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        createdAt: (user as unknown as { createdAt?: Date }).createdAt,
      },
      /**
       * Số liên hệ hiệu lực. Người đăng ký bằng SĐT đã có sẵn `User.phone` nên
       * không việc gì phải khai lại — gộp ở đây để giao diện chỉ cần đọc một
       * chỗ, và người đó không bị nhắc "hãy bổ sung số điện thoại".
       */
      contactPhone: profile?.phone ?? user.phone ?? null,
      profile: profile
        ? {
            fullName: profile.fullName,
            phone: profile.phone,
            username: profile.username,
            avatarUrl: profile.avatarUrl,
            avatarOriginalUrl: profile.avatarOriginalUrl,
            dateOfBirth: profile.dateOfBirth,
            gender: profile.gender,
            bio: profile.bio,
          }
        : null,
    };
  }

  async updateProfile(user: UserDocument, dto: UpdateProfileDto) {
    const profile = await this.profileModel.findOne({ user: user._id });
    if (!profile) throw new NotFoundException('Không tìm thấy hồ sơ.');

    if (dto.fullName !== undefined) profile.fullName = dto.fullName.trim();
    if (dto.bio !== undefined) profile.bio = dto.bio.trim();
    if (dto.gender !== undefined) {
      profile.gender = dto.gender as typeof profile.gender;
    }
    if (dto.dateOfBirth !== undefined) {
      const date = new Date(dto.dateOfBirth);
      // Ngày sinh ở tương lai chắc chắn là gõ nhầm.
      if (date.getTime() > Date.now()) {
        throw new BadRequestException('Ngày sinh không thể ở tương lai.');
      }
      profile.dateOfBirth = date;
    }
    // Ảnh đại diện: chỉ nhận URL đã tải lên qua /media, không nhận link ngoài.
    if (dto.avatarUrl !== undefined) profile.avatarUrl = dto.avatarUrl;
    if (dto.avatarOriginalUrl !== undefined) {
      profile.avatarOriginalUrl = dto.avatarOriginalUrl;
    }

    await profile.save();
    return this.getMe(user);
  }

  /* --------------------------- Đổi số liên hệ --------------------------- */

  /**
   * Gửi mã xác thực tới số điện thoại người dùng muốn gắn vào tài khoản.
   *
   * Đây là chỗ DUY NHẤT trong hệ thống bắt xác thực SĐT, vì chỉ ở đây người
   * dùng mới đang khai "số này là của tôi". Số người nhận trong sổ địa chỉ
   * không đi qua đây — nó có thể là số của người khác.
   */
  async sendPhoneCode(user: UserDocument, dto: SendPhoneCodeDto) {
    const phone = normalizePhone(dto.phone);

    const profile = await this.profileModel.findOne({ user: user._id });
    if ((profile?.phone ?? user.phone) === phone) {
      throw new BadRequestException(
        'Đây đã là số điện thoại của tài khoản bạn.',
      );
    }

    const result = await this.auth.requestOtp('phone', phone);
    return { ok: true, message: 'Đã gửi mã xác thực tới số điện thoại.', ...result };
  }

  /** Xác thực mã rồi mới ghi số vào hồ sơ. */
  async changePhone(user: UserDocument, dto: ChangePhoneDto) {
    const phone = normalizePhone(dto.phone);

    const status = this.auth.verifyOtp('phone', phone, dto.code);
    if (status !== 'success') {
      throw new BadRequestException(OTP_VERIFY_MESSAGES[status]);
    }
    // 🔴 Xác thực xong còn để lại cờ "đã xác thực" 15 phút, mà cờ đó khoá theo
    // SỐ chứ không theo người — bỏ lại thì trong 15 phút ấy có thể đăng ký một
    // tài khoản mới bằng số này mà không cần OTP. Tiêu thụ ngay, y như lúc
    // đăng nhập bằng SĐT.
    this.auth.consumeVerified('phone', phone);

    const profile = await this.profileModel.findOne({ user: user._id });
    if (!profile) throw new NotFoundException('Không tìm thấy hồ sơ.');

    profile.phone = phone;
    await profile.save();
    return this.getMe(user);
  }

  /* ----------------------------- Sổ địa chỉ ----------------------------- */

  async listAddresses(user: UserDocument) {
    const addresses = await this.addressModel
      .find({ user: user._id })
      .sort({ isDefault: -1, updatedAt: -1 });
    return { addresses: addresses.map((a) => this.publicAddress(a)) };
  }

  async createAddress(user: UserDocument, dto: SaveAddressDto) {
    const count = await this.addressModel.countDocuments({ user: user._id });
    if (count >= MAX_ADDRESSES) {
      throw new BadRequestException(
        `Bạn chỉ lưu được tối đa ${MAX_ADDRESSES} địa chỉ.`,
      );
    }

    // Địa chỉ đầu tiên luôn là mặc định, dù người dùng không tích chọn — nếu
    // không, sổ có địa chỉ mà trang thanh toán không biết điền cái nào.
    const isDefault = count === 0 ? true : !!dto.isDefault;
    if (isDefault) await this.clearDefault(user);

    const address = await this.addressModel.create({
      user: user._id,
      ...this.fields(dto),
      isDefault,
    });
    return { address: this.publicAddress(address) };
  }

  async updateAddress(user: UserDocument, id: string, dto: SaveAddressDto) {
    const address = await this.findOwned(user, id);

    if (dto.isDefault && !address.isDefault) await this.clearDefault(user);
    Object.assign(address, this.fields(dto));
    // Không cho bỏ cờ mặc định của địa chỉ mặc định DUY NHẤT: bỏ xong thì
    // không còn địa chỉ nào được chọn sẵn lúc thanh toán.
    if (dto.isDefault !== undefined) {
      address.isDefault = dto.isDefault || address.isDefault;
    }

    await address.save();
    return { address: this.publicAddress(address) };
  }

  async setDefaultAddress(user: UserDocument, id: string) {
    const address = await this.findOwned(user, id);
    await this.clearDefault(user);
    address.isDefault = true;
    await address.save();
    return { address: this.publicAddress(address) };
  }

  async removeAddress(user: UserDocument, id: string) {
    const address = await this.findOwned(user, id);
    const wasDefault = address.isDefault;
    await address.deleteOne();

    // Xoá địa chỉ mặc định thì phải chỉ định người kế nhiệm, nếu không sổ còn
    // địa chỉ mà không cái nào được chọn sẵn.
    if (wasDefault) {
      const next = await this.addressModel
        .findOne({ user: user._id })
        .sort({ updatedAt: -1 });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }
    return { ok: true };
  }

  private async clearDefault(user: UserDocument) {
    await this.addressModel.updateMany(
      { user: user._id, isDefault: true },
      { $set: { isDefault: false } },
    );
  }

  private async findOwned(user: UserDocument, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy địa chỉ.');
    }
    const address = await this.addressModel.findOne({
      _id: id,
      user: user._id,
    });
    if (!address) throw new NotFoundException('Không tìm thấy địa chỉ.');
    return address;
  }

  /** Các trường được phép ghi — tách ra để tạo và sửa dùng chung một chỗ. */
  private fields(dto: SaveAddressDto) {
    return {
      label: dto.label?.trim(),
      recipientName: dto.recipientName.trim(),
      recipientPhone: dto.recipientPhone.trim(),
      street: dto.street.trim(),
      ward: dto.ward?.trim(),
      wardCode: dto.wardCode,
      province: dto.province.trim(),
      provinceCode: dto.provinceCode,
      lat: dto.lat,
      lng: dto.lng,
      country: dto.country?.trim() || 'Việt Nam',
    };
  }

  private publicAddress(a: AddressDocument) {
    return {
      id: String(a._id),
      label: a.label,
      recipientName: a.recipientName,
      recipientPhone: a.recipientPhone,
      street: a.street,
      ward: a.ward,
      wardCode: a.wardCode,
      province: a.province,
      provinceCode: a.provinceCode,
      lat: a.lat,
      lng: a.lng,
      country: a.country,
      isDefault: a.isDefault,
    };
  }
}
