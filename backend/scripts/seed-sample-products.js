/**
 * Seed sản phẩm mẫu từ ảnh trong seller/PicturesSample.
 *
 * - Upload từng ảnh lên R2 (public) → URL hiển thị thật trên web người mua.
 * - Mỗi sản phẩm có PHÂN LOẠI và GIÁ RIÊNG cho từng phân loại (variant.price).
 * - LUÂN PHIÊN gán cho các gian hàng đã có (SHOPS).
 * - Chèn thẳng DB đúng shape như app tạo (slug, categoryPath, priceMin/Max,
 *   searchText...). KHÔNG sinh embedding ở đây — chạy backfill-embeddings.js sau.
 *
 * An toàn: bỏ qua sản phẩm đã tồn tại (theo tên) nên chạy lại không nhân đôi.
 * Chạy: node scripts/seed-sample-products.js
 */
const fs = require('fs');
const path = require('path');
const m = require('mongoose');
const { randomUUID } = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

/* ------------------------------- Cấu hình ------------------------------- */
function env(key) {
  const p = path.join(__dirname, '..', '.env');
  const line = fs
    .readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .find((x) => x.startsWith(key + '='));
  return line ? line.slice(line.indexOf('=') + 1).trim() : '';
}
const MONGO_URI = env('MONGO_URI');
const R2 = {
  accountId: env('R2_ACCOUNT_ID'),
  accessKeyId: env('R2_ACCESS_KEY_ID'),
  secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
  bucket: env('R2_BUCKET'),
  endpoint: env('R2_ENDPOINT'),
  publicBaseUrl: env('R2_PUBLIC_BASE_URL').replace(/\/$/, ''),
};
const PICS = path.join(__dirname, '..', '..', 'seller', 'PicturesSample');

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2.endpoint || `https://${R2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2.accessKeyId,
    secretAccessKey: R2.secretAccessKey,
  },
});

/* ---------------------- Tiện ích chữ (như common/text.ts) ---------------------- */
const deaccent = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
const slugify = (s, max = 60) =>
  deaccent(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'san-pham';
const shortId = (n = 6) => Math.random().toString(36).slice(2, 2 + n);
function buildSearchText(parts) {
  const set = new Set();
  for (const p of parts) {
    if (!p) continue;
    for (const w of deaccent(p).split(/\s+/)) if (w) set.add(w);
  }
  return [...set].join(' ');
}

/* ------------------------------- Gian hàng ------------------------------- */
const SHOPS = [
  '6a5ba360201c4afbe45ba278', // Sora Store
  '6a5ef309109313ba0b34dcc6', // LV Store
  '6a660f79a2bccc689590f317', // ShopKA
  '6a661198a2bccc689590f31f', // Kimetsu Shop
  '6a67224181f7eaad487dfc7b', // Ánh Nguyệt Store
  '6a6722fa81f7eaad487dfc7f', // NgocLanLT_Store
];

/* ------------------------------- Danh mục ------------------------------- */
const CAT = {
  phuKienCN: '6a5cf9de7774f3b9477e8592', // Phụ kiện công nghệ
  trangSuc: '6a5cf9de7774f3b9477e858e', // Trang sức & Phụ kiện
  thoiTrangNam: '6a5cf9de7774f3b9477e8589', // Thời trang nam
  doDungPhongTam: '6a5cf9de7774f3b9477e859a', // Đồ dùng phòng tắm
  doDungBep: '6a5cf9de7774f3b9477e8597', // Đồ dùng nhà bếp
  tuiVi: '6a5cf9de7774f3b9477e858c', // Túi ví
  thietBiYte: '6a5cf9df7774f3b9477e85a3', // Thiết bị y tế
  phuKienOto: '6a5cf9e07774f3b9477e85bf', // Phụ kiện ô tô
  chamSocDa: '6a5cf9de7774f3b9477e859e', // Chăm sóc da
};

/* ------------------------- Bộ dựng phân loại ------------------------- */
// 1 tầng: mỗi [giá trị, giá] → 1 biến thể có giá riêng.
function tier1(name, entries) {
  return {
    optionTiers: [{ name, values: entries.map((e) => e[0]) }],
    variants: entries.map(([v, price]) => ({ optionValues: [v], price })),
  };
}
// 2 tầng: Màu × Size, giá theo hàm priceOf(size).
function tierColorSize(colors, sizes, priceOf) {
  const variants = [];
  for (const c of colors)
    for (const s of sizes)
      variants.push({ optionValues: [c, s], price: priceOf(s) });
  return {
    optionTiers: [
      { name: 'Màu sắc', values: colors },
      { name: 'Kích cỡ', values: sizes },
    ],
    variants,
  };
}

/* --------------------------- Dữ liệu sản phẩm --------------------------- */
const PRODUCTS = [
  {
    file: 'cn-11134207-820l4-monm3ry4h9u62b@resize_w450_nl.webp',
    category: CAT.phuKienCN,
    name: 'Củ sạc nhanh UGREEN 65W GaN Nexode Air siêu nhỏ gọn',
    desc: 'Củ sạc nhanh UGREEN 65W công nghệ GaN cho kích thước siêu nhỏ, sạc được laptop, điện thoại và máy tính bảng. Tự nhận công suất phù hợp từng thiết bị, an toàn chống quá nhiệt. Thiết kế Ultra-Mini dễ mang theo khi đi làm, đi học.',
    attrs: [
      ['Công suất', '65W'],
      ['Công nghệ', 'GaN'],
      ['Cổng sạc', 'USB-C'],
    ],
    weightGram: 150,
    ...tier1('Phiên bản', [
      ['Chỉ củ sạc', 359000],
      ['Củ sạc + Cáp C-C 1m', 419000],
      ['Củ sạc + Cáp C-C 2m', 449000],
    ]),
  },
  {
    file: 'sg-11134201-823q9-mp4jez3yuygxfa@resize_w450_nl.webp',
    category: CAT.trangSuc,
    name: 'Kính râm chụp ngoài kính cận tròng phân cực chống UV',
    desc: 'Kính râm thiết kế chụp trực tiếp bên ngoài kính cận, không cần tháo kính. Tròng phân cực chống chói và chống tia UV, kiểu kéo lên hạ xuống tiện lợi khi lái xe. Gọng nhẹ ôm mặt, phù hợp cả nam và nữ.',
    attrs: [
      ['Kiểu tròng', 'Phân cực chống UV'],
      ['Đặc điểm', 'Đeo ngoài kính cận'],
    ],
    weightGram: 60,
    ...tier1('Màu sắc', [
      ['Đen bóng', 95000],
      ['Nâu trà', 109000],
      ['Xám khói', 109000],
    ]),
  },
  {
    file: 'sg-11134201-824hz-metn1srihfr71f.webp',
    category: CAT.trangSuc,
    name: 'Vòng tay thạch anh tóc đen phong cách thủy mặc',
    desc: 'Vòng tay chế tác từ thạch anh tóc đen tự nhiên với những sợi tóc đen huyền bí như tranh thủy mặc. Đính charm bạc tinh xảo, mang ý nghĩa phong thủy an lành. Có thể chọn vòng chuỗi hạt, vòng bangle hoặc combo cả hai làm quà tặng.',
    attrs: [
      ['Chất liệu', 'Thạch anh tóc đen'],
      ['Phong cách', 'Thủy mặc cổ điển'],
    ],
    weightGram: 120,
    ...tier1('Kiểu', [
      ['Vòng chuỗi hạt', 159000],
      ['Vòng bangle đá', 239000],
      ['Combo 2 món', 369000],
    ]),
  },
  {
    file: 'vn-11134207-7ra0g-m8ln2fkvwoku4a.webp',
    category: CAT.thoiTrangNam,
    name: 'Áo thun JULIDO form oversize chất cotton thêu logo',
    desc: 'Áo thun unisex form oversize thương hiệu JULIDO, chất cotton dày dặn thấm hút mồ hôi, thêu logo tinh tế trước ngực. Phối đồ dễ dàng, mặc đi chơi đi học đều hợp. Nhiều màu và size cho bạn thoải mái lựa chọn.',
    attrs: [
      ['Chất liệu', 'Cotton'],
      ['Form', 'Oversize'],
      ['Thương hiệu', 'JULIDO'],
    ],
    weightGram: 250,
    ...tierColorSize(
      ['Trắng', 'Đen', 'Xanh navy', 'Xám đậm', 'Xám nhạt'],
      ['M', 'L', 'XL', 'XXL'],
      (s) => (s === 'XXL' ? 209000 : s === 'XL' ? 199000 : 189000),
    ),
  },
  {
    file: 'vn-11134207-7ras8-mcvi964l3pdr43@resize_w450_nl.webp',
    category: CAT.doDungPhongTam,
    name: 'Nước giặt Lix đậm đặc hương nước hoa dạng túi',
    desc: 'Nước giặt Lix đậm đặc công thức mới, đánh bay vết bẩn cứng đầu và lưu hương nước hoa thơm lâu trên quần áo. Dùng được cho cả giặt tay và giặt máy, ít bọt dễ xả. Dạng túi tiện lợi, tiết kiệm cho gia đình.',
    attrs: [
      ['Hương', 'Nước hoa'],
      ['Dạng', 'Đậm đặc'],
    ],
    weightGram: 3200,
    ...tier1('Khối lượng', [
      ['Túi 1.4kg', 42000],
      ['Túi 2.4kg', 68000],
      ['Túi 3.2kg', 92000],
    ]),
  },
  {
    file: 'vn-11134207-81ztc-mk7vi7aqk3d46b.webp',
    category: CAT.phuKienCN,
    name: 'Ốp lưng iPhone MagSafe trong suốt chống sốc bảo vệ camera',
    desc: 'Ốp lưng trong suốt hỗ trợ sạc MagSafe, viền cao bảo vệ cụm camera và màn hình. Nhựa dẻo chống sốc, chống ố vàng, ôm máy chắc chắn mà vẫn mỏng nhẹ. Chọn đúng dòng iPhone của bạn để vừa khít.',
    attrs: [
      ['Tính năng', 'Hỗ trợ MagSafe'],
      ['Chất liệu', 'Nhựa dẻo trong'],
      ['Bảo vệ', 'Cụm camera'],
    ],
    weightGram: 50,
    ...tier1('Dòng máy', [
      ['iPhone 12', 55000],
      ['iPhone 13', 55000],
      ['iPhone 14', 59000],
      ['iPhone 15', 65000],
      ['iPhone 15 Pro Max', 75000],
      ['iPhone 16', 79000],
      ['iPhone 16 Pro Max', 89000],
    ]),
  },
  {
    file: 'vn-11134207-81ztc-mmjzwjbu5ipwfe.webp',
    category: CAT.doDungBep,
    name: 'Bộ 3 dao thái DABETO lưỡi thép không gỉ cán gỗ trúc',
    desc: 'Bộ dao bếp DABETO lưỡi thép không gỉ sắc bén, chống gỉ, cán gỗ trúc chắc tay và cân bằng khi cầm. Thái, chặt, gọt đều êm tay. Chọn thêm thớt gỗ hoặc kéo bếp để hoàn thiện góc bếp nhà bạn.',
    attrs: [
      ['Chất liệu lưỡi', 'Thép không gỉ'],
      ['Cán', 'Gỗ trúc'],
    ],
    weightGram: 700,
    ...tier1('Combo', [
      ['Bộ 3 dao', 189000],
      ['Bộ 3 dao + thớt gỗ', 269000],
      ['Bộ 3 dao + kéo bếp', 239000],
    ]),
  },
  {
    file: 'vn-11134207-81ztc-mnvouazd8tfs1b@resize_w450_nl.webp',
    category: CAT.tuiVi,
    name: 'Túi trống du lịch GOTO vải chống nước đeo chéo',
    desc: 'Túi trống du lịch GOTO ngăn rộng đựng được nhiều đồ, vải chống nước bền đẹp, quai đeo chéo có đệm êm vai. Có ngăn để giày riêng, phù hợp đi tập gym, du lịch ngắn ngày. Thiết kế trẻ trung nhiều màu.',
    attrs: [
      ['Kiểu', 'Túi trống du lịch'],
      ['Chất liệu', 'Vải chống nước'],
    ],
    weightGram: 500,
    ...tier1('Màu sắc', [
      ['Cam đất', 259000],
      ['Xanh rêu', 259000],
      ['Xám', 259000],
    ]),
  },
  {
    file: 'vn-11134207-81ztc-mpt6r3cg63nm8d.webp',
    category: CAT.thietBiYte,
    name: 'Bao cao su HerFeel Ultra Thin 003 siêu mỏng hương nước hoa',
    desc: 'Bao cao su HerFeel Ultra Thin 003 siêu mỏng cho cảm giác chân thật, bổ sung gel bôi trơn X2 dịu nhẹ và hương nước hoa thoảng nhẹ. Bao bì kín đáo, che tên sản phẩm khi giao hàng. Hộp 10 chiếc cao cấp.',
    attrs: [
      ['Loại', 'Siêu mỏng 003'],
      ['Hương', 'Nước hoa'],
      ['Bôi trơn', 'Gel X2'],
    ],
    weightGram: 100,
    ...tier1('Combo', [
      ['Hộp 10 bao', 89000],
      ['Combo 2 hộp', 169000],
      ['Combo 3 hộp', 239000],
    ]),
  },
  {
    file: 'vn-11134207-81ztc-mpz1h8iqu2330a@resize_w450_nl.webp',
    category: CAT.phuKienOto,
    name: 'Tinh dầu treo xe ô tô Mộc An Nhiên khử mùi khuếch tán hương',
    desc: 'Tinh dầu treo xe Mộc An Nhiên giúp khử mùi và khuếch tán hương thơm dịu nhẹ, lưu hương lâu trong không gian nhỏ như xe hơi, tủ quần áo hay phòng vệ sinh. Lọ thủy tinh treo tiện lợi, nhiều mùi hương để lựa chọn.',
    attrs: [
      ['Công dụng', 'Khử mùi, khuếch tán hương'],
      ['Vị trí dùng', 'Xe hơi / tủ / phòng'],
    ],
    weightGram: 80,
    ...tier1('Mùi hương', [
      ['Oải hương', 35000],
      ['Hoa nhài', 35000],
      ['Cà phê', 35000],
      ['Bạc hà', 35000],
      ['Sả chanh', 35000],
      ['Hoa hồng', 35000],
    ]),
  },
  {
    file: 'vn-11134207-81ztc-mqfs0cu47qxa56.webp',
    category: CAT.chamSocDa,
    name: 'Bọt vệ sinh nam PlayAh thành phần thiên nhiên hương nước hoa',
    desc: 'Bọt vệ sinh nam PlayAh với thành phần thiên nhiên, hoạt chất AHA và tinh chất citric acid giúp làm sạch dịu nhẹ, lưu hương nước hoa Anh Quốc nam tính. Tạo bọt mịn dễ dùng hằng ngày. Chọn từng mùi hoặc combo 3 chai.',
    attrs: [
      ['Thành phần', 'Thiên nhiên, AHA'],
      ['Hương', 'Nước hoa Anh Quốc'],
    ],
    weightGram: 200,
    ...tier1('Loại', [
      ['Franklin', 79000],
      ['Mint Whisper', 79000],
      ['Dark Indulgence', 89000],
      ['Combo 3 chai', 199000],
    ]),
  },
  {
    file: 'vn-11134207-81ztc-mqvqfrllw64h39.webp',
    category: CAT.doDungBep,
    name: 'Bộ hộp đựng thực phẩm Deli x Vusign nhựa nguyên sinh an toàn',
    desc: 'Bộ hộp đựng thực phẩm Deli x Vusign nhiều kích cỡ từ 250ml đến 8.5L, nhựa nguyên sinh an toàn, nắp đậy kín chống rò rỉ. Dùng được trong lò vi sóng, tủ lạnh và máy rửa bát, xếp chồng gọn gàng tiết kiệm không gian.',
    attrs: [
      ['Chất liệu', 'Nhựa nguyên sinh'],
      ['Dùng được', 'Lò vi sóng / tủ lạnh / máy rửa bát'],
    ],
    weightGram: 1500,
    ...tier1('Bộ', [
      ['Bộ 8 hộp', 129000],
      ['Bộ 15 hộp', 199000],
      ['Bộ 21 hộp', 269000],
    ]),
  },
];

const MIME = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };

async function uploadImage(file) {
  const buf = fs.readFileSync(path.join(PICS, file));
  const ext = (file.split('.').pop() || 'webp').split('@')[0];
  const key = `products/${randomUUID()}.${ext}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: R2.bucket,
      Key: key,
      Body: buf,
      ContentType: MIME[ext] || 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  return { url: `${R2.publicBaseUrl}/${key}`, key };
}

/** categoryPath = chuỗi tổ tiên [gốc ... lá] (giống resolveForProduct). */
async function categoryPathOf(db, leafId) {
  const chain = [];
  let cur = await db
    .collection('categories')
    .findOne({ _id: new m.Types.ObjectId(leafId) });
  const catName = cur ? cur.name : undefined;
  while (cur) {
    chain.unshift(cur._id);
    cur = cur.parent
      ? await db.collection('categories').findOne({ _id: cur.parent })
      : null;
  }
  return { path: chain, name: catName };
}

(async () => {
  if (!R2.accessKeyId || !R2.publicBaseUrl) {
    console.error('Thiếu cấu hình R2 trong .env.');
    process.exit(1);
  }
  await m.connect(MONGO_URI);
  const db = m.connection;

  let created = 0;
  let skipped = 0;
  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i];
    const shopId = SHOPS[i % SHOPS.length];
    const shop = new m.Types.ObjectId(shopId);

    if (await db.collection('products').findOne({ name: p.name })) {
      console.log(`  [bỏ qua] đã có: ${p.name}`);
      skipped++;
      continue;
    }

    const img = await uploadImage(p.file);
    const { path: categoryPath, name: categoryName } = await categoryPathOf(
      db,
      p.category,
    );

    // Mỗi biến thể mang GIÁ RIÊNG + tồn kho ngẫu nhiên.
    const variants = p.variants.map((v) => ({
      _id: new m.Types.ObjectId(),
      optionValues: v.optionValues,
      price: v.price,
      stock: 40 + Math.floor(Math.random() * 100),
      isActive: true,
    }));
    const prices = variants.map((v) => v.price);
    const attributes = p.attrs.map(([name, value]) => ({ name, value }));

    const searchText = buildSearchText([
      p.name,
      p.desc,
      categoryName,
      ...attributes.flatMap((a) => [a.name, a.value]),
      ...p.optionTiers.flatMap((t) => t.values),
    ]);

    const now = new Date();
    await db.collection('products').insertOne({
      _id: new m.Types.ObjectId(),
      shop,
      name: p.name,
      slug: `${slugify(p.name)}-${shortId()}`,
      description: p.desc,
      category: new m.Types.ObjectId(p.category),
      categoryPath,
      optionTiers: p.optionTiers,
      variants,
      priceMin: Math.min(...prices),
      priceMax: Math.max(...prices),
      totalStock: variants.reduce((s, v) => s + v.stock, 0),
      images: [img],
      attributes,
      shipping: { weightGram: p.weightGram },
      searchText,
      status: 'active',
      moderation: { state: 'ok' },
      publishedAt: now,
      deletedAt: null,
      stats: {
        views: 0,
        sold: 0,
        favorites: 0,
        ratingAvg: 0,
        ratingCount: 0,
        ratingBreakdown: [0, 0, 0, 0, 0],
      },
      createdAt: now,
      updatedAt: now,
      __v: 0,
    });
    created++;
    console.log(
      `  [tạo] ${p.name}\n         shop=${shopId} | ${variants.length} biến thể | giá ${Math.min(
        ...prices,
      ).toLocaleString('vi')}–${Math.max(...prices).toLocaleString('vi')}đ`,
    );
  }

  console.log(`\nXong: ${created} tạo mới, ${skipped} bỏ qua.`);
  console.log('→ Chạy tiếp: node scripts/backfill-embeddings.js để sinh embedding.');
  await m.disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error('LỖI:', e);
  try {
    await m.disconnect();
  } catch {}
  process.exit(1);
});
