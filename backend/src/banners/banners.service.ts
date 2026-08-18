import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Banner, BannerDocument } from './schemas/banner.schema';
import {
  CreateBannerDto,
  UpdateBannerDto,
} from './dto/admin-banner.dto';
import { MediaService } from '../media/media.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';

export interface PublicBanner {
  id: string;
  imageUrl: string;
  link?: string;
}

export interface AdminBanner {
  id: string;
  label: string;
  imageUrl: string;
  imageOriginalUrl: string;
  crop?: Record<string, unknown>;
  link?: string;
  order: number;
  isActive: boolean;
  updatedBy?: string;
  updatedAt?: Date;
}

@Injectable()
export class BannersService {
  constructor(
    @InjectModel(Banner.name) private readonly bannerModel: Model<BannerDocument>,
    private readonly media: MediaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Trang chủ buyer — chỉ banner đang bật, đã sắp thứ tự. */
  async publicList(): Promise<PublicBanner[]> {
    const banners = await this.bannerModel
      .find({ isActive: true })
      .sort({ order: 1 })
      .select('imageUrl link')
      .lean();
    return banners.map((b) => ({
      id: String(b._id),
      imageUrl: b.imageUrl,
      link: b.link,
    }));
  }

  /* --------------------------------- Admin ---------------------------------- */

  async adminList(): Promise<AdminBanner[]> {
    const banners = await this.bannerModel.find().sort({ order: 1 }).lean();
    return banners.map((b) => this.shape(b));
  }

  async adminCreate(admin: AdminPrincipal, dto: CreateBannerDto) {
    const order = await this.bannerModel.countDocuments({});
    const banner = await this.bannerModel.create({
      label: dto.label.trim(),
      imageUrl: dto.imageUrl,
      imageKey: dto.imageKey,
      imageOriginalUrl: dto.imageOriginalUrl,
      imageOriginalKey: dto.imageOriginalKey,
      crop: dto.crop,
      link: dto.link?.trim() || undefined,
      order,
      isActive: true,
      updatedBy: admin.email,
    });

    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Thêm banner trang chủ',
      targetLabel: banner.label,
    });

    return { ok: true, id: String(banner._id) };
  }

  async adminUpdate(admin: AdminPrincipal, id: string, dto: UpdateBannerDto) {
    const banner = await this.mustFind(id);
    if (dto.label !== undefined) banner.label = dto.label.trim();
    if (dto.link !== undefined) banner.link = dto.link.trim() || undefined;

    // Có ảnh mới (admin vừa cắt/tải lên lại) → thay cả bộ, dọn ảnh CŨ trên R2
    // (cả bản đã cắt lẫn bản gốc) sau khi DB đã ghi bộ mới thành công, không
    // để lại file rác nhưng cũng không mất ảnh cũ nếu ghi DB thất bại giữa
    // chừng.
    const oldImageKey = banner.imageKey;
    const oldOriginalKey = banner.imageOriginalKey;
    const imageReplaced =
      dto.imageUrl !== undefined &&
      dto.imageKey !== undefined &&
      dto.imageOriginalUrl !== undefined &&
      dto.imageOriginalKey !== undefined;
    if (imageReplaced) {
      banner.imageUrl = dto.imageUrl!;
      banner.imageKey = dto.imageKey!;
      banner.imageOriginalUrl = dto.imageOriginalUrl!;
      banner.imageOriginalKey = dto.imageOriginalKey!;
      banner.crop = dto.crop;
    }

    banner.updatedBy = admin.email;
    await banner.save();

    if (imageReplaced) {
      await Promise.all([
        this.media.delete(oldImageKey).catch(() => undefined),
        this.media.delete(oldOriginalKey).catch(() => undefined),
      ]);
    }

    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Sửa banner trang chủ',
      targetLabel: banner.label,
      detail: imageReplaced ? 'Đã đổi ảnh' : undefined,
    });
    return { ok: true };
  }

  /**
   * Ghi lại thứ tự MỚI cho TOÀN BỘ banner — danh sách phẳng (không phân
   * nhóm cha/con như Danh mục), nên chỉ cần validate `orderedIds` khớp đúng
   * TOÀN BỘ banner hiện có, tránh ghi đè sai khi có admin khác vừa thêm/xoá.
   */
  async adminReorder(admin: AdminPrincipal, orderedIds: string[]) {
    const all = await this.bannerModel.find().select('_id');
    const actualIds = new Set(all.map((b) => String(b._id)));
    const givenIds = new Set(orderedIds);
    const matches =
      actualIds.size === givenIds.size &&
      givenIds.size === orderedIds.length &&
      [...actualIds].every((id) => givenIds.has(id));
    if (!matches) {
      throw new BadRequestException(
        'Danh sách sắp xếp không khớp với dữ liệu hiện tại — vui lòng tải lại trang.',
      );
    }

    await this.bannerModel.bulkWrite(
      orderedIds.map((id, order) => ({
        updateOne: { filter: { _id: id }, update: { $set: { order } } },
      })),
    );

    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Sắp xếp lại banner trang chủ',
      detail: `${orderedIds.length} banner`,
    });
    return { ok: true };
  }

  async adminSetVisibility(admin: AdminPrincipal, id: string, isActive: boolean) {
    const banner = await this.mustFind(id);
    if (banner.isActive === isActive) return { ok: true };

    banner.isActive = isActive;
    banner.updatedBy = admin.email;
    await banner.save();

    await this.auditLog.log({
      adminEmail: admin.email,
      action: isActive ? 'Bật banner trang chủ' : 'Tắt banner trang chủ',
      targetLabel: banner.label,
    });
    return { ok: true };
  }

  /** Xoá cứng — dọn CẢ HAI ảnh (đã cắt + gốc) trên R2, không để lại file rác. */
  async adminDelete(admin: AdminPrincipal, id: string) {
    const banner = await this.mustFind(id);
    await banner.deleteOne();

    // Ảnh trên R2 không phải nguồn sự thật (banner đã xoá khỏi DB rồi) — lỗi
    // xoá file không được chặn thao tác, chỉ để lại rác chấp nhận được.
    await Promise.all([
      this.media.delete(banner.imageKey).catch(() => undefined),
      this.media.delete(banner.imageOriginalKey).catch(() => undefined),
    ]);

    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Xoá banner trang chủ',
      targetLabel: banner.label,
    });
    return { ok: true };
  }

  private shape(b: {
    _id: Types.ObjectId;
    label: string;
    imageUrl: string;
    imageOriginalUrl: string;
    crop?: Record<string, unknown>;
    link?: string;
    order: number;
    isActive: boolean;
    updatedBy?: string;
  }): AdminBanner {
    return {
      id: String(b._id),
      label: b.label,
      imageUrl: b.imageUrl,
      imageOriginalUrl: b.imageOriginalUrl,
      crop: b.crop,
      link: b.link,
      order: b.order,
      isActive: b.isActive,
      updatedBy: b.updatedBy,
      updatedAt: (b as unknown as { updatedAt?: Date }).updatedAt,
    };
  }

  private async mustFind(id: string): Promise<BannerDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy banner.');
    }
    const banner = await this.bannerModel.findById(id);
    if (!banner) throw new NotFoundException('Không tìm thấy banner.');
    return banner;
  }
}
