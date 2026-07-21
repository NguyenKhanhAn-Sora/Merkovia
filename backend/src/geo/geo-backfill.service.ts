import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GeoService } from './geo.service';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { Address, AddressDocument } from '../addresses/schemas/address.schema';

/**
 * Điền mã hành chính cho dữ liệu tạo TRƯỚC khi có tính năng lưu mã.
 *
 * Vì sao cần: cước vận chuyển so sánh `provinceCode` hai đầu. Bản ghi cũ chỉ
 * có tên tỉnh nên luôn rơi vào mức liên tỉnh — khách ở ngay cùng tỉnh với kho
 * vẫn bị tính cước xa. Bắt người dùng vào sửa tay từng shop/địa chỉ là không
 * chấp nhận được.
 *
 * An toàn: CHỈ thêm mã vào bản ghi đang thiếu, không bao giờ sửa tên hay ghi
 * đè mã đã có. Chạy lại nhiều lần cũng không đổi gì thêm.
 */
@Injectable()
export class GeoBackfillService implements OnModuleInit {
  private readonly logger = new Logger(GeoBackfillService.name);

  constructor(
    private readonly geo: GeoService,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    @InjectModel(Address.name)
    private readonly addressModel: Model<AddressDocument>,
  ) {}

  async onModuleInit() {
    // Không chặn quá trình khởi động: hỏng thì app vẫn chạy, chỉ là cước lùi
    // về mức liên tỉnh cho tới lần khởi động sau.
    void this.run().catch((e: unknown) =>
      this.logger.warn(`Bỏ qua backfill mã hành chính: ${String(e)}`),
    );
  }

  async run(): Promise<{ shops: number; addresses: number }> {
    const [shops, addresses] = await Promise.all([
      this.backfillShops(),
      this.backfillAddresses(),
    ]);
    if (shops || addresses) {
      this.logger.log(
        `Đã điền mã hành chính cho ${shops} gian hàng và ${addresses} địa chỉ.`,
      );
    }
    return { shops, addresses };
  }

  private async backfillShops(): Promise<number> {
    const shops = await this.shopModel.find({
      'pickupAddress.province': { $nin: [null, ''] },
      'pickupAddress.provinceCode': null,
    });

    let done = 0;
    for (const shop of shops) {
      const pickup = shop.pickupAddress;
      if (!pickup?.province) continue;

      const provinceCode = await this.geo.resolveProvinceCode(pickup.province);
      if (!provinceCode) {
        this.logger.warn(
          `Không tra được mã tỉnh cho gian hàng "${shop.name}": "${pickup.province}"`,
        );
        continue;
      }

      pickup.provinceCode = provinceCode;
      pickup.wardCode ??= await this.geo.resolveWardCode(
        provinceCode,
        pickup.ward,
      );
      // Gán lại cả object: Mongoose không tự nhận thay đổi bên trong subdocument.
      shop.pickupAddress = pickup;
      shop.markModified('pickupAddress');
      await shop.save();
      done++;
    }
    return done;
  }

  private async backfillAddresses(): Promise<number> {
    const addresses = await this.addressModel.find({
      province: { $nin: [null, ''] },
      provinceCode: null,
    });

    let done = 0;
    for (const address of addresses) {
      const provinceCode = await this.geo.resolveProvinceCode(address.province);
      if (!provinceCode) continue;

      address.provinceCode = provinceCode;
      address.wardCode ??= await this.geo.resolveWardCode(
        provinceCode,
        address.ward,
      );
      await address.save();
      done++;
    }
    return done;
  }
}
