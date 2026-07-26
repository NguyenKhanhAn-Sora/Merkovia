/**
 * Backfill vector embedding cho các sản phẩm CHƯA có (hoặc nhúng bằng model cũ).
 *
 * Chạy MỘT LẦN sau khi đã đặt GEMINI_API_KEY vào .env:
 *   node scripts/backfill-embeddings.js
 * Thêm --all để nhúng lại TẤT CẢ (kể cả sản phẩm đã có vector — khi đổi model).
 *
 * An toàn: chỉ đọc + $set embedding, không xoá gì. Bỏ qua món lỗi và đi tiếp.
 */
const fs = require('fs');
const path = require('path');
const m = require('mongoose');

function readEnv(key) {
  const envPath = path.join(__dirname, '..', '.env');
  const env = fs.readFileSync(envPath, 'utf8');
  const line = env.split(/\r?\n/).find((x) => x.startsWith(key + '='));
  return line ? line.slice(line.indexOf('=') + 1).trim() : '';
}

const MONGO_URI = readEnv('MONGO_URI');
const API_KEY = readEnv('GEMINI_API_KEY');
const MODEL = readEnv('GEMINI_EMBED_MODEL') || 'gemini-embedding-001';
const BASE =
  readEnv('GEMINI_BASE_URL') ||
  'https://generativelanguage.googleapis.com/v1beta';
const ALL = process.argv.includes('--all');

const MAX_CHARS = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Dựng văn bản embed — GIỮ NGUYÊN như backend/src/search/embed-text.ts. */
function buildEmbedText(p, categoryName) {
  const parts = [];
  if (p.name) parts.push(p.name);
  if (categoryName) parts.push(categoryName);
  for (const a of p.attributes ?? [])
    if (a && a.name && a.value) parts.push(`${a.name}: ${a.value}`);
  for (const t of p.optionTiers ?? [])
    if (t && t.values && t.values.length)
      parts.push(`${t.name}: ${t.values.join(', ')}`);
  if (p.description) parts.push(p.description);
  return parts.join('. ').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
}

async function embed(text, title) {
  const url = `${BASE}/models/${MODEL}:embedContent?key=${API_KEY}`;
  const body = {
    model: `models/${MODEL}`,
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
  };
  if (title) body.title = title;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || !values.length) throw new Error('rong');
  return values;
}

(async () => {
  if (!API_KEY) {
    console.error('Thiếu GEMINI_API_KEY trong .env — chưa thể backfill.');
    process.exit(1);
  }
  await m.connect(MONGO_URI);
  const db = m.connection;

  const cats = await db.collection('categories').find({}).toArray();
  const catName = new Map(cats.map((c) => [String(c._id), c.name]));

  const filter = ALL
    ? { status: 'active', deletedAt: null }
    : {
        status: 'active',
        deletedAt: null,
        $or: [
          { embedding: { $exists: false } },
          { embedding: { $size: 0 } },
          { embeddingModel: { $ne: MODEL } },
        ],
      };
  const products = await db.collection('products').find(filter).toArray();
  console.log(`Sẽ nhúng ${products.length} sản phẩm (model ${MODEL}).`);

  let done = 0;
  let failed = 0;
  for (const p of products) {
    const text = buildEmbedText(p, catName.get(String(p.category)));
    if (!text) {
      failed++;
      continue;
    }
    try {
      const vector = await embed(text, p.name);
      await db.collection('products').updateOne(
        { _id: p._id },
        {
          $set: {
            embedding: vector,
            embeddingModel: MODEL,
            embeddingAt: new Date(),
          },
        },
      );
      done++;
      process.stdout.write(`\r  đã nhúng ${done}/${products.length}`);
    } catch (err) {
      failed++;
      console.warn(`\n  [bỏ qua] ${p.name}: ${err.message}`);
    }
    // Giãn nhịp để không chạm giới hạn tần suất của gói miễn phí.
    await sleep(120);
  }

  console.log(`\nXong: ${done} nhúng thành công, ${failed} bỏ qua.`);
  await m.disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error('LỖI:', e);
  try {
    await m.disconnect();
  } catch {}
  process.exit(1);
});
