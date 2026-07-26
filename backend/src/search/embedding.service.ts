import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { config } from '../config/config';
import { Product, ProductDocument } from '../products/schemas/product.schema';

/**
 * Sinh vector embedding qua Gemini `embedContent` (REST, không thêm SDK — giống
 * cách `geo/places.service` gọi Goong).
 *
 * 🔴 FAIL-SAFE tuyệt đối: mọi lỗi mạng/khoá/thời gian đều trả `null` và KHÔNG
 * ném ra ngoài. Sinh embedding là việc phụ trợ, không được làm hỏng việc tạo/sửa
 * sản phẩm hay tìm kiếm. Thiếu `apiKey` thì coi như tính năng tắt.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly timeoutMs = 8000;

  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  /** Có bật tìm kiếm ngữ nghĩa không (phụ thuộc khoá Gemini). */
  isEnabled(): boolean {
    return !!config.gemini.apiKey;
  }

  get model(): string {
    return config.gemini.embedModel;
  }

  /**
   * Nhúng một đoạn văn bản → vector, hoặc `null` nếu tắt/lỗi.
   *
   * `taskType` khớp mục đích giúp Gemini cho chất lượng truy hồi cao hơn:
   * tài liệu (sản phẩm) dùng RETRIEVAL_DOCUMENT, truy vấn tìm kiếm dùng
   * RETRIEVAL_QUERY — hai không gian này được model căn cho khớp nhau.
   */
  async embed(
    text: string,
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
    title?: string,
  ): Promise<number[] | null> {
    if (!this.isEnabled()) return null;
    const clean = text?.trim();
    if (!clean) return null;

    const url =
      `${config.gemini.baseUrl}/models/${this.model}:embedContent` +
      `?key=${config.gemini.apiKey}`;
    const body: Record<string, unknown> = {
      model: `models/${this.model}`,
      content: { parts: [{ text: clean }] },
      taskType,
    };
    // `title` chỉ hợp lệ với tài liệu, giúp model hiểu ngữ cảnh tên sản phẩm.
    if (taskType === 'RETRIEVAL_DOCUMENT' && title) body.title = title;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`Gemini embed HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as {
        embedding?: { values?: number[] };
      };
      const values = data?.embedding?.values;
      return Array.isArray(values) && values.length ? values : null;
    } catch (err) {
      this.logger.warn(
        `Gemini embed lỗi: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Nhúng văn bản của sản phẩm rồi LƯU thẳng vào doc (`updateOne`, không đụng
   * validate toàn tài liệu). Gọi kiểu "bắn rồi quên" sau khi tạo/sửa sản phẩm.
   */
  async embedAndStore(
    productId: Types.ObjectId | string,
    text: string,
    title?: string,
  ): Promise<void> {
    const vector = await this.embed(text, 'RETRIEVAL_DOCUMENT', title);
    if (!vector) return;
    try {
      await this.productModel.updateOne(
        { _id: productId },
        {
          $set: {
            embedding: vector,
            embeddingModel: this.model,
            embeddingAt: new Date(),
          },
        },
      );
    } catch (err) {
      this.logger.warn(
        `Lưu embedding thất bại: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
