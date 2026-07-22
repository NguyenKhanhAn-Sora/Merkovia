import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Address, AddressDocument } from '../addresses/schemas/address.schema';
import { Profile, ProfileDocument } from '../profiles/schemas/profile.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

/**
 * Điền người nhận cho địa chỉ tạo TRƯỚC khi luồng đăng ký biết ghi trường này.
 *
 * Vì sao cần: luồng đăng ký tạo địa chỉ mặc định nhưng bỏ trống `recipientName`
 * (và cả `recipientPhone` với tài khoản đăng ký bằng email). Hậu quả là Sổ địa
 * chỉ chỉ hiện mỗi con đường, còn đơn hàng đi ra thì hãng vận chuyển không có
 * tên ai để gọi. Bắt từng người vào sửa tay là đẩy lỗi của mình sang họ.
 *
 * An toàn: CHỈ điền vào ô đang trống, không bao giờ ghi đè giá trị đã có —
 * người nhận có thể cố ý là người khác. Chạy lại nhiều lần không đổi gì thêm.
 */
@Injectable()
export class AccountBackfillService implements OnModuleInit {
  private readonly logger = new Logger(AccountBackfillService.name);

  constructor(
    @InjectModel(Address.name)
    private readonly addressModel: Model<AddressDocument>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  onModuleInit() {
    // Không chặn khởi động: hỏng thì app vẫn chạy, chỉ là sổ địa chỉ còn thiếu
    // tên người nhận cho tới lần khởi động sau.
    void this.run().catch((e: unknown) =>
      this.logger.warn(`Bỏ qua backfill người nhận: ${String(e)}`),
    );
  }

  async run(): Promise<number> {
    const pending = await this.addressModel.find({
      $or: [
        { recipientName: { $in: [null, ''] } },
        { recipientPhone: { $in: [null, ''] } },
      ],
    });
    if (pending.length === 0) return 0;

    // Gom một lượt thay vì hỏi từng địa chỉ: một người thường có nhiều địa chỉ.
    //
    // 🔴 Truyền thẳng ObjectId, KHÔNG truyền chuỗi. Mongoose ép kiểu chuỗi cho
    // `_id` nhưng không ép cho đường dẫn tham chiếu như `Profile.user`, nên
    // `$in` toàn chuỗi lặng lẽ trả về rỗng — backfill chạy xong mà không sửa gì
    // và cũng chẳng báo lỗi.
    const byId = new Map(pending.map((a) => [String(a.user), a.user]));
    const userIds = [...byId.values()];
    const [profiles, users] = await Promise.all([
      this.profileModel.find({ user: { $in: userIds } }).lean(),
      this.userModel.find({ _id: { $in: userIds } }).lean(),
    ]);
    const nameOf = new Map(
      profiles.map((p) => [String(p.user), p.fullName ?? p.displayName]),
    );
    const phoneOf = new Map(users.map((u) => [String(u._id), u.phone]));

    let done = 0;
    for (const address of pending) {
      const owner = String(address.user);
      let touched = false;

      if (!address.recipientName) {
        const name = nameOf.get(owner);
        if (name) {
          address.recipientName = name;
          touched = true;
        }
      }
      // Chỉ tài khoản đăng ký bằng SĐT mới có số để mượn; tài khoản email thì
      // đành để trống — bịa ra một số là gửi hàng tới chỗ không ai nghe máy.
      if (!address.recipientPhone) {
        const phone = phoneOf.get(owner);
        if (phone) {
          address.recipientPhone = phone;
          touched = true;
        }
      }

      if (touched) {
        await address.save();
        done++;
      }
    }

    if (done) this.logger.log(`Đã điền người nhận cho ${done} địa chỉ.`);
    return done;
  }
}
