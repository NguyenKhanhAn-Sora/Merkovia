import { Controller, Get } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** Cây danh mục — công khai (seller chọn khi đăng bán, buyer dùng để duyệt). */
  @Get()
  tree() {
    return this.categories.getTree();
  }
}
