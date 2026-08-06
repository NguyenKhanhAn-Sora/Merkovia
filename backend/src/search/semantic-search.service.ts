import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { EmbeddingService } from './embedding.service';
import { buildSearchText } from '../common/text';
import { dot, norm } from './cosine';

/** Một ứng viên đã tiền xử lý sẵn để tính cosine cho nhanh. */
interface Candidate {
  id: Types.ObjectId;
  vector: number[];
  /** Chuẩn (norm) tính sẵn — khỏi lặp lại mỗi truy vấn. */
  norm: number;
  /** searchText (đã bỏ dấu) để cộng điểm khi trùng đúng từ khoá. */
  searchText: string;
}

/**
 * Tìm kiếm ngữ nghĩa bằng cosine TRONG NODE (không cần vector index của Atlas).
 *
 * Phù hợp catalog cỡ hiện tại: nạp vector của sản phẩm đang bán (cache ngắn), so
 * độ tương đồng với vector của truy vấn, xếp hạng. Muốn scale lớn thì thay
 * `loadCandidates` + vòng cosine bằng `$vectorSearch` — phần còn lại giữ nguyên.
 *
 * 🔴 Hạ cấp mượt: khoá Gemini trống hoặc gọi lỗi → `rankIds` trả `null`, để
 * `CatalogService` tự lui về khớp từ khoá cũ.
 */
@Injectable()
export class SemanticSearchService {
  private readonly logger = new Logger(SemanticSearchService.name);

  /** Lấy tối đa bấy nhiêu ứng viên tốt nhất trả cho tầng duyệt (đủ phân trang). */
  private readonly CANDIDATE_LIMIT = 300;
  /** Sàn cosine tuyệt đối — chỉ chặn rác hiển nhiên (trực giao/ngược hướng). */
  private readonly MIN_SCORE = 0.4;
  /**
   * 🔴 Ngưỡng TƯƠNG ĐỐI theo món khớp nhất — bộ lọc "cùng ngành hàng" thật sự.
   * Với embedding chiều cao, MỌI cosine dồn vào dải hẹp (đo thực tế: món liên
   * quan ~0.64–0.73, món lạc đề ~0.54–0.62) nên sàn tuyệt đối vô dụng. Tỉ lệ so
   * với đỉnh mới tách được cùng-ngành khỏi khác-ngành: giữ món có
   * `cosine ≥ đỉnh × tỉ lệ`. 0.9 đo từ catalog thật (khoảng hợp lệ ~0.88–0.92).
   */
  private readonly RELATIVE_RATIO = 0.9;
  /** Trọng số cộng thêm khi sản phẩm chứa đúng từ khoá (hybrid nhẹ). */
  private readonly KEYWORD_BONUS = 0.15;
  /** Thời gian sống của cache ứng viên (ms) — cân bằng tươi mới vs tải DB. */
  private readonly CACHE_TTL = 30_000;

  private cache: { at: number; rows: Candidate[] } | null = null;
  private loading: Promise<Candidate[]> | null = null;

  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly embedding: EmbeddingService,
  ) {}

  /**
   * Xếp hạng id sản phẩm theo độ liên quan ngữ nghĩa với `query`.
   * - `null`  → tính năng tắt / lỗi / truy vấn không nhúng được → hãy lui về từ khoá.
   * - `[]`    → có chạy nhưng không món nào đủ liên quan → nên lui về từ khoá.
   * - `[...]` → id đã xếp theo độ liên quan giảm dần.
   */
  async rankIds(query: string): Promise<Types.ObjectId[] | null> {
    if (!this.embedding.isEnabled()) return null;
    const q = query?.trim();
    if (!q) return null;

    const qVec = await this.embedding.embed(q, 'RETRIEVAL_QUERY');
    if (!qVec) return null;

    let candidates: Candidate[];
    try {
      candidates = await this.loadCandidates();
    } catch (err) {
      this.logger.warn(
        `Nạp ứng viên embedding lỗi: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
    if (!candidates.length) return [];

    const qNorm = norm(qVec);
    if (qNorm === 0) return null;

    // Bỏ dấu từ khoá để so với searchText (cũng đã bỏ dấu) khi cộng điểm.
    const qWords = buildSearchText([q]).split(' ').filter(Boolean);

    // Vòng 1: cosine THÔ cho mọi ứng viên hợp lệ + tìm đỉnh (món khớp nhất).
    const raw: { id: Types.ObjectId; cosine: number; searchText: string }[] = [];
    let topCosine = -Infinity;
    for (const c of candidates) {
      // Số chiều lệch = vector của model khác → không so được, bỏ qua.
      if (c.vector.length !== qVec.length || c.norm === 0) continue;
      // Norm hai vế tính sẵn nên chỉ cần tích vô hướng ở đây.
      const cosine = dot(qVec, c.vector) / (qNorm * c.norm);
      if (cosine < this.MIN_SCORE) continue; // sàn tuyệt đối: chặn rác
      if (cosine > topCosine) topCosine = cosine;
      raw.push({ id: c.id, cosine, searchText: c.searchText });
    }
    if (!raw.length) return [];

    // Vòng 2: cắt theo ngưỡng TƯƠNG ĐỐI (loại ngành hàng lạc đề) rồi mới xếp
    // hạng — chỉ cộng bonus từ khoá cho món đã qua cửa, tránh từ khoá "cứu"
    // một món lạc đề vượt rào.
    const cutoff = topCosine * this.RELATIVE_RATIO;
    const scored = raw
      .filter((r) => r.cosine >= cutoff)
      .map((r) => ({
        id: r.id,
        score: r.cosine + this.keywordBonus(qWords, r.searchText),
      }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, this.CANDIDATE_LIMIT).map((s) => s.id);
  }

  /** Cộng điểm theo tỉ lệ từ khoá xuất hiện trong searchText (đã bỏ dấu). */
  private keywordBonus(qWords: string[], searchText: string): number {
    if (!qWords.length || !searchText) return 0;
    let hit = 0;
    for (const w of qWords) if (searchText.includes(w)) hit++;
    return (hit / qWords.length) * this.KEYWORD_BONUS;
  }

  /**
   * Nạp vector của sản phẩm đang hiển thị công khai, có cache ngắn. Gộp các lời
   * gọi trùng thời điểm vào MỘT truy vấn (`loading`) để nhiều tìm kiếm đồng thời
   * không cùng lúc kéo cả bộ vector về.
   */
  private async loadCandidates(): Promise<Candidate[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.CACHE_TTL) {
      return this.cache.rows;
    }
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const docs = await this.productModel
        .find({
          status: 'active',
          deletedAt: null,
          'moderation.state': 'ok',
          embeddingModel: this.embedding.model,
          embedding: { $exists: true, $ne: [] },
        })
        // `embedding` là select:false nên phải xin thêm rõ ràng.
        .select('_id embedding searchText')
        .lean();

      const rows: Candidate[] = [];
      for (const d of docs) {
        const vector = (d as { embedding?: number[] }).embedding;
        if (!Array.isArray(vector) || !vector.length) continue;
        const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
        rows.push({
          id: d._id as Types.ObjectId,
          vector,
          norm,
          searchText: (d as { searchText?: string }).searchText ?? '',
        });
      }
      this.cache = { at: Date.now(), rows };
      return rows;
    })();

    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  }
}
