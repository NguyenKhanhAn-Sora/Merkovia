import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { CATEGORY_SEED } from './category.seed';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { slugify } from '../common/text';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  children: CategoryNode[];
}

export interface AdminCategoryNode {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  order: number;
  isActive: boolean;
  /** Số sản phẩm còn sống gán TRỰC TIẾP vào node này (chỉ có ý nghĩa với danh mục lá). */
  productCount: number;
  children: AdminCategoryNode[];
  /** Chỉ có ở Ngành hàng gốc: không còn Danh mục con nào đang bật → seller chọn vào đây sẽ bị kẹt. */
  hasNoActiveChildren?: boolean;
}

@Injectable()
export class CategoriesService implements OnModuleInit {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Seed cây danh mục lần đầu chạy (chỉ khi collection còn rỗng). */
  async onModuleInit() {
    if (await this.categoryModel.exists({})) return;

    let created = 0;
    for (const [i, root] of CATEGORY_SEED.entries()) {
      const parent = await this.categoryModel.create({
        name: root.name,
        slug: slugify(root.name),
        parent: null,
        ancestors: [],
        level: 0,
        order: i,
        icon: root.icon,
      });
      created++;

      for (const [j, childName] of root.children.entries()) {
        await this.categoryModel.create({
          name: childName,
          slug: slugify(`${root.name}-${childName}`),
          parent: parent._id,
          ancestors: [parent._id],
          level: 1,
          order: j,
        });
        created++;
      }
    }
    this.logger.log(`Đã seed ${created} danh mục.`);
  }

  /** Toàn bộ cây danh mục đang bật, đã sắp thứ tự. */
  async getTree(): Promise<CategoryNode[]> {
    const all = await this.categoryModel
      .find({ isActive: true })
      .sort({ level: 1, order: 1 })
      .lean();

    const byId = new Map<string, CategoryNode>();
    const roots: CategoryNode[] = [];

    for (const c of all) {
      byId.set(String(c._id), {
        id: String(c._id),
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        children: [],
      });
    }
    for (const c of all) {
      const node = byId.get(String(c._id))!;
      if (c.parent === null) {
        // Ngành hàng gốc thật sự.
        roots.push(node);
        continue;
      }
      const parent = byId.get(String(c.parent));
      // 🔴 Cha bị tắt (không có trong `byId` vì query chỉ lấy `isActive: true`)
      // → ẨN LUÔN con, KHÔNG được rơi xuống nhánh "coi như gốc" — nếu không,
      // tắt một Ngành hàng để lại Danh mục con nào đó vẫn bật sẽ khiến nó bật
      // ngược lên thành ngành hàng gốc sai chỗ.
      if (parent) parent.children.push(node);
    }
    return roots;
  }

  /**
   * Kiểm tra danh mục hợp lệ và trả về đường dẫn tổ tiên để lưu kèm sản phẩm.
   * Trả null nếu id không tồn tại / đã tắt.
   */
  async resolveForProduct(categoryId: string): Promise<{
    id: Types.ObjectId;
    path: Types.ObjectId[];
    name: string;
  } | null> {
    if (!Types.ObjectId.isValid(categoryId)) return null;
    const c = await this.categoryModel.findOne({
      _id: categoryId,
      isActive: true,
    });
    if (!c) return null;
    return {
      id: c._id,
      // Gồm cả chính nó → lọc `{ categoryPath: X }` ra được cả nhánh lẫn node.
      path: [...c.ancestors, c._id],
      name: c.name,
    };
  }

  /* -------------------------- Admin: quản lý cây -------------------------- */

  /**
   * Toàn bộ cây (kể cả danh mục đang tắt) kèm số sản phẩm còn sống gán vào
   * từng node — cho admin nhìn thấy hậu quả trước khi xoá/tắt.
   */
  async adminTree(): Promise<AdminCategoryNode[]> {
    const [all, counts] = await Promise.all([
      this.categoryModel.find().sort({ level: 1, order: 1 }).lean(),
      this.productModel.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { deletedAt: null } },
        { $group: { _id: '$category', n: { $sum: 1 } } },
      ]),
    ]);
    const countByCategory = new Map(counts.map((c) => [String(c._id), c.n]));

    const byId = new Map<string, AdminCategoryNode>();
    const roots: AdminCategoryNode[] = [];

    for (const c of all) {
      byId.set(String(c._id), {
        id: String(c._id),
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        order: c.order,
        isActive: c.isActive,
        productCount: countByCategory.get(String(c._id)) ?? 0,
        children: [],
      });
    }
    for (const c of all) {
      const node = byId.get(String(c._id))!;
      if (c.parent === null) {
        roots.push(node);
      } else {
        byId.get(String(c.parent))?.children.push(node);
      }
    }
    for (const root of roots) {
      root.hasNoActiveChildren = !root.children.some((ch) => ch.isActive);
    }
    return roots;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let slug = base;
    let n = 2;
    while (await this.categoryModel.exists({ slug })) {
      slug = `${base}-${n}`;
      n++;
    }
    return slug;
  }

  /**
   * Tạo Ngành hàng gốc (bỏ trống `parentId`) hoặc Danh mục con dưới một
   * Ngành hàng (có `parentId`).
   *
   * 🔴 Chặn tạo cấp 3: form đăng sản phẩm của seller
   * (`seller/components/products/CategoryPicker.tsx`) cứng 2 tầng "Ngành
   * hàng → Danh mục", chỉ gán được danh mục LÁ cho sản phẩm. Tạo cấp 3 sẽ ra
   * dữ liệu seller không bao giờ chọn tới được.
   */
  async adminCreate(
    admin: AdminPrincipal,
    dto: { name: string; parentId?: string; icon?: string },
  ) {
    let parent: CategoryDocument | null = null;
    if (dto.parentId) {
      parent = await this.categoryModel.findById(dto.parentId);
      if (!parent) throw new NotFoundException('Không tìm thấy ngành hàng.');
      if (parent.level !== 0) {
        throw new BadRequestException(
          'Chỉ tạo được danh mục con dưới một Ngành hàng gốc (hệ thống chỉ hỗ trợ 2 cấp).',
        );
      }
    }

    const parentRef = parent ? parent._id : null;
    const order = await this.categoryModel.countDocuments({
      parent: parentRef,
    });

    const category = await this.categoryModel.create({
      name: dto.name.trim(),
      slug: await this.uniqueSlug(dto.name),
      parent: parentRef,
      ancestors: parent ? [...parent.ancestors, parent._id] : [],
      level: parent ? parent.level + 1 : 0,
      order,
      icon: dto.icon?.trim() || undefined,
    });

    await this.auditLog.log({
      adminEmail: admin.email,
      action: parent ? 'Tạo danh mục con' : 'Tạo ngành hàng',
      targetLabel: category.name,
    });

    return { ok: true, id: String(category._id) };
  }

  async adminUpdate(
    admin: AdminPrincipal,
    id: string,
    dto: { name?: string; icon?: string },
  ) {
    const category = await this.mustFind(id);
    if (dto.name !== undefined) category.name = dto.name.trim();
    // Cố ý KHÔNG đổi slug theo tên: slug là định danh ổn định (có thể đã được
    // dùng ở URL/bookmark), đổi tên không nên kéo theo đổi đường dẫn.
    if (dto.icon !== undefined) category.icon = dto.icon.trim() || undefined;
    await category.save();

    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Sửa danh mục',
      targetLabel: category.name,
    });
    return { ok: true };
  }

  /**
   * Ghi lại thứ tự MỚI cho toàn bộ một nhóm anh em (cùng `parent`) sau khi
   * admin kéo-thả sắp xếp lại ở giao diện — client gửi lên đúng thứ tự cuối
   * cùng, server chỉ cần gán `order` theo vị trí trong mảng.
   *
   * 🔴 Bắt buộc validate `orderedIds` khớp CHÍNH XÁC (đủ, đúng, không thiếu)
   * với các con thật sự đang có trong DB — chặn trường hợp một admin khác đã
   * thêm/xoá danh mục trong lúc admin này đang kéo-thả trên dữ liệu cũ, tránh
   * ghi đè sai hoặc bỏ sót.
   */
  async adminReorder(parentId: string | undefined, orderedIds: string[]) {
    const parentRef = parentId ? new Types.ObjectId(parentId) : null;
    const siblings = await this.categoryModel
      .find({ parent: parentRef })
      .select('_id');
    const actualIds = new Set(siblings.map((s) => String(s._id)));
    const givenIds = new Set(orderedIds);
    const matches =
      actualIds.size === givenIds.size &&
      [...actualIds].every((id) => givenIds.has(id));
    if (!matches) {
      throw new BadRequestException(
        'Danh sách sắp xếp không khớp với dữ liệu hiện tại — vui lòng tải lại trang.',
      );
    }

    await this.categoryModel.bulkWrite(
      orderedIds.map((id, order) => ({
        updateOne: { filter: { _id: id }, update: { $set: { order } } },
      })),
    );
    return { ok: true };
  }

  /**
   * Bật/tắt hiển thị — công cụ chính để "gỡ" một danh mục mà KHÔNG đụng tới
   * sản phẩm đã gán (khác xoá cứng).
   *
   * Tắt một Ngành hàng gốc thì CASCADE tắt luôn mọi Danh mục con — nếu không,
   * con vẫn `isActive: true` trong khi cha tắt sẽ để lộ lỗ hổng ở `getTree()`
   * (con bị cha ẩn nhưng bản thân vẫn "sống", xem comment ở đó). Chiều ngược
   * lại (bật cha) KHÔNG tự bật lại con — admin tự chọn con nào bật lại.
   */
  async adminSetVisibility(
    admin: AdminPrincipal,
    id: string,
    isActive: boolean,
  ) {
    const category = await this.mustFind(id);
    if (category.isActive === isActive) return { ok: true };

    if (isActive && category.level > 0) {
      const parent = await this.categoryModel.findById(category.parent);
      if (parent && !parent.isActive) {
        throw new BadRequestException(
          'Ngành hàng cha đang bị ẩn — hãy bật ngành hàng cha trước.',
        );
      }
    }

    category.isActive = isActive;
    await category.save();

    if (!isActive && category.level === 0) {
      await this.categoryModel.updateMany(
        { parent: category._id },
        { $set: { isActive: false } },
      );
    }

    await this.auditLog.log({
      adminEmail: admin.email,
      action: isActive ? 'Bật hiển thị danh mục' : 'Tắt hiển thị danh mục',
      targetLabel: category.name,
    });
    return { ok: true };
  }

  /** Xoá cứng — chỉ khi danh mục KHÔNG còn con và KHÔNG còn sản phẩm nào tham chiếu (kể cả gián tiếp qua categoryPath). */
  async adminDelete(admin: AdminPrincipal, id: string) {
    const category = await this.mustFind(id);

    const childCount = await this.categoryModel.countDocuments({
      parent: category._id,
    });
    if (childCount > 0) {
      throw new BadRequestException(
        `Còn ${childCount} danh mục con — hãy xoá hoặc tắt hiển thị chúng trước.`,
      );
    }

    const productCount = await this.productModel.countDocuments({
      categoryPath: category._id,
      deletedAt: null,
    });
    if (productCount > 0) {
      throw new BadRequestException(
        `Còn ${productCount} sản phẩm đang gán vào danh mục này — không thể xoá. Hãy tắt hiển thị thay vì xoá.`,
      );
    }

    await category.deleteOne();
    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Xoá danh mục',
      targetLabel: category.name,
    });
    return { ok: true };
  }

  private async mustFind(id: string): Promise<CategoryDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy danh mục.');
    }
    const category = await this.categoryModel.findById(id);
    if (!category) throw new NotFoundException('Không tìm thấy danh mục.');
    return category;
  }
}
