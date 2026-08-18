import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Follow, FollowDocument } from './schemas/follow.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { NotificationsService } from '../notifications/notifications.service';
import type { UserDocument } from '../users/schemas/user.schema';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface FollowedShop {
  id: string;
  name: string;
  slug?: string;
  logoUrl?: string;
  status: string;
  vacationMode: boolean;
  province?: string;
  followedAt: Date;
}

@Injectable()
export class FollowsService {
  private readonly logger = new Logger(FollowsService.name);

  constructor(
    @InjectModel(Follow.name) private readonly followModel: Model<FollowDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Bật/tắt theo dõi một gian hàng.
   *
   * Dùng `deleteOne`/`create` rồi đọc kết quả thay vì "kiểm tra rồi ghi" —
   * bấm hai lần thật nhanh sẽ chạy song song, và unique index là thứ duy nhất
   * bảo đảm không tạo hai bản ghi. Cùng mẫu với `FavoritesService.toggle`.
   */
  async toggle(user: UserDocument, shopId: string) {
    if (!Types.ObjectId.isValid(shopId)) {
      throw new NotFoundException('Không tìm thấy gian hàng.');
    }
    const shop = await this.shopModel.findOne({ _id: shopId }).select('_id owner');
    if (!shop) throw new NotFoundException('Không tìm thấy gian hàng.');
    if (String(shop.owner) === String(user._id)) {
      // Không chặn hẳn bằng lỗi ồn ào — tự theo dõi shop của mình vô hại,
      // chỉ vô nghĩa, nên lặng lẽ từ chối thay vì ném exception.
      return { following: false };
    }

    const removed = await this.followModel.deleteOne({
      user: user._id,
      shop: shop._id,
    });
    if (removed.deletedCount === 1) return { following: false };

    try {
      await this.followModel.create({ user: user._id, shop: shop._id });
    } catch (e: unknown) {
      // 11000 = đã có bản ghi (hai lần bấm song song) → coi như đã theo dõi rồi.
      if ((e as { code?: number })?.code !== 11000) throw e;
    }
    return { following: true };
  }

  async isFollowing(user: UserDocument, shopId: string): Promise<{ following: boolean }> {
    if (!Types.ObjectId.isValid(shopId)) return { following: false };
    const exists = await this.followModel.exists({ user: user._id, shop: shopId });
    return { following: !!exists };
  }

  async countFollowers(shopId: Types.ObjectId | string): Promise<number> {
    return this.followModel.countDocuments({ shop: shopId });
  }

  /** Các gian hàng người dùng đang theo dõi — có tìm nhanh theo tên. */
  async list(user: UserDocument, page = 1, limit = 24, q?: string) {
    const term = q?.trim();
    const pipeline: PipelineStage[] = [
      { $match: { user: user._id } },
      {
        $lookup: {
          from: this.shopModel.collection.collectionName,
          localField: 'shop',
          foreignField: '_id',
          as: 'shop',
        },
      },
      { $unwind: '$shop' }, // shop đã xoá cứng (hiếm) thì tự loại khỏi kết quả
      ...(term
        ? [{ $match: { 'shop.name': { $regex: escapeRegex(term), $options: 'i' } } }]
        : []),
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          items: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                followedAt: '$createdAt',
                shopId: '$shop._id',
                name: '$shop.name',
                slug: '$shop.slug',
                logoUrl: '$shop.logoUrl',
                status: '$shop.status',
                vacationMode: '$shop.vacationMode',
                province: '$shop.pickupAddress.province',
              },
            },
          ],
          total: [{ $count: 'n' }],
        },
      },
    ];

    const [result] = await this.followModel.aggregate<{
      items: Array<{
        shopId: Types.ObjectId;
        name: string;
        slug?: string;
        logoUrl?: string;
        status: string;
        vacationMode: boolean;
        province?: string;
        followedAt: Date;
      }>;
      total: { n: number }[];
    }>(pipeline);

    const items: FollowedShop[] = (result?.items ?? []).map((r) => ({
      id: String(r.shopId),
      name: r.name,
      slug: r.slug,
      logoUrl: r.logoUrl,
      status: r.status,
      vacationMode: r.vacationMode,
      province: r.province,
      followedAt: r.followedAt,
    }));

    return { items, total: result?.total?.[0]?.n ?? 0, page, limit };
  }

  /* ------------------------ Báo tin cho follower --------------------------- */

  /**
   * Báo cho TOÀN BỘ follower của một shop khi shop đó có sản phẩm MỚI lần đầu
   * lên kệ (qua kiểm duyệt) hoặc bắt đầu một khuyến mãi mới.
   *
   * Không được ném lỗi ra ngoài — nơi gọi (kiểm duyệt sản phẩm, tạo khuyến
   * mãi) đã hoàn tất nghiệp vụ chính, báo tin hỏng không được làm hỏng luồng
   * đó (cùng triết lý với `NotificationsService.notifyUser`).
   */
  private async notifyFollowers(
    shopId: Types.ObjectId,
    payload: Parameters<NotificationsService['notifyUser']>[2],
  ): Promise<void> {
    try {
      const followers = await this.followModel.find({ shop: shopId }).select('user').lean();
      if (followers.length === 0) return;
      await Promise.all(
        followers.map((f) => this.notifications.notifyUser(f.user, 'buyer', payload)),
      );
    } catch (e: unknown) {
      this.logger.warn(`Không báo được cho follower của shop ${String(shopId)}: ${String(e)}`);
    }
  }

  async notifyNewProduct(
    shopId: Types.ObjectId,
    product: { id: Types.ObjectId | string; name: string; slug?: string },
  ): Promise<void> {
    await this.notifyFollowers(shopId, {
      type: 'shop_new_product',
      title: 'Gian hàng bạn theo dõi vừa đăng sản phẩm mới',
      body: `"${product.name}" vừa lên kệ.`,
      link: product.slug ? `/product/${product.slug}` : undefined,
      data: { productId: String(product.id) },
    });
  }

  async notifyNewPromotion(
    shopId: Types.ObjectId,
    product: { id: Types.ObjectId | string; name: string; slug?: string },
  ): Promise<void> {
    await this.notifyFollowers(shopId, {
      type: 'shop_new_promotion',
      title: 'Gian hàng bạn theo dõi vừa có khuyến mãi mới',
      body: `"${product.name}" đang được giảm giá.`,
      link: product.slug ? `/product/${product.slug}` : undefined,
      data: { productId: String(product.id) },
    });
  }
}
