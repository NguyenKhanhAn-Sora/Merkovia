import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { CATEGORY_SEED } from './category.seed';
import { slugify } from '../common/text';

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  children: CategoryNode[];
}

@Injectable()
export class CategoriesService implements OnModuleInit {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
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
      const parent = c.parent ? byId.get(String(c.parent)) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  /**
   * Kiểm tra danh mục hợp lệ và trả về đường dẫn tổ tiên để lưu kèm sản phẩm.
   * Trả null nếu id không tồn tại / đã tắt.
   */
  async resolveForProduct(
    categoryId: string,
  ): Promise<{ id: Types.ObjectId; path: Types.ObjectId[]; name: string } | null> {
    if (!Types.ObjectId.isValid(categoryId)) return null;
    const c = await this.categoryModel.findOne({
      _id: categoryId,
      isActive: true,
    });
    if (!c) return null;
    return {
      id: c._id as Types.ObjectId,
      // Gồm cả chính nó → lọc `{ categoryPath: X }` ra được cả nhánh lẫn node.
      path: [...c.ancestors, c._id as Types.ObjectId],
      name: c.name,
    };
  }
}
