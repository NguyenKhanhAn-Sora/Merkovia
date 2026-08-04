/* Kiểm thử đình chỉ có thời hạn + gỡ đình chỉ (tự động qua Redis nếu bật, gỡ
 * tay qua endpoint mới). REDIS_URL hiện đang TẮT trong .env nên bài test này
 * xác nhận đường thoái lui (degrade gracefully) hoạt động đúng: đình chỉ có
 * hạn vẫn tạo được, chỉ là không ai tự gỡ — và gỡ tay vẫn hoạt động bình
 * thường trong mọi trường hợp. Chạy qua NestFactory, không qua HTTP. */
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AppModule } from './src/app.module';
import { ShopReportsService } from './src/shop-reports/shop-reports.service';
import { ShopReport } from './src/shop-reports/schemas/shop-report.schema';
import { Shop } from './src/shops/schemas/shop.schema';
import { User } from './src/users/schemas/user.schema';
import { Notification } from './src/notifications/schemas/notification.schema';

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  OK   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}`, extra ?? '');
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const shopReports = app.get(ShopReportsService);
  const shopModel = app.get(getModelToken(Shop.name));
  const userModel = app.get(getModelToken(User.name));
  const reportModel = app.get(getModelToken(ShopReport.name));
  const notifModel = app.get(getModelToken(Notification.name));

  const userIds: Types.ObjectId[] = [];
  const shopIds: Types.ObjectId[] = [];
  const admin = { id: 'zz-test-admin', email: 'admin@test.local' };

  try {
    const mkUser = async () => {
      const u = await userModel.create({
        email: `zz-suspend-${Math.random().toString(36).slice(2, 8)}@test.local`,
        roles: ['buyer'],
      });
      userIds.push(u._id);
      return u;
    };
    const mkOwner = async () => {
      const u = await userModel.create({
        phone: `9${Math.floor(Math.random() * 100000000)
          .toString()
          .padStart(8, '0')}`,
        roles: ['seller'],
      });
      userIds.push(u._id);
      return u;
    };
    const mkShop = async (owner: Types.ObjectId, name: string) => {
      const s = await shopModel.create({
        owner,
        name,
        businessType: 'personal',
        contactName: 'Test',
        contactPhone: '900000000',
        status: 'active',
      });
      shopIds.push(s._id);
      return s;
    };
    const reporter = await mkUser();

    console.log('\n== 1. Đình chỉ CÓ THỜI HẠN — suspendedUntil được set đúng ==');
    const owner1 = await mkOwner();
    const shop1 = await mkShop(owner1._id, 'ZZ Suspend Shop 1');
    await shopReports.create(reporter, {
      shopId: String(shop1._id),
      reasonType: 'scam',
      detail: 'Test đình chỉ có thời hạn 7 ngày.',
    });
    const before = Date.now();
    await shopReports.resolve(admin, String(shop1._id), {
      action: 'suspend',
      note: 'Đình chỉ 7 ngày do vi phạm nghiêm trọng.',
      suspendDays: 7,
    });
    const shop1After = await shopModel.findById(shop1._id).lean();
    check('Shop chuyển trạng thái suspended', shop1After?.status === 'suspended');
    check(
      'suspendedUntil được set khoảng 7 ngày sau',
      !!shop1After?.suspendedUntil &&
        Math.abs(
          shop1After.suspendedUntil.getTime() - (before + 7 * 86_400_000),
        ) < 60_000,
      shop1After?.suspendedUntil,
    );
    const notif1 = await notifModel
      .findOne({ user: owner1._id, type: 'shop_report_suspended' })
      .lean();
    check(
      'Thông báo nhắc đúng thời hạn 7 ngày trong nội dung',
      !!notif1 && /7 ngày/.test((notif1 as { body: string }).body),
      notif1,
    );

    console.log('\n== 2. Đình chỉ VÔ THỜI HẠN — suspendedUntil = null ==');
    const owner2 = await mkOwner();
    const shop2 = await mkShop(owner2._id, 'ZZ Suspend Shop 2');
    await shopReports.create(reporter, {
      shopId: String(shop2._id),
      reasonType: 'prohibited_item',
      detail: 'Test đình chỉ vô thời hạn.',
    });
    await shopReports.resolve(admin, String(shop2._id), {
      action: 'suspend',
      note: 'Đình chỉ vô thời hạn do vi phạm pháp luật.',
    });
    const shop2After = await shopModel.findById(shop2._id).lean();
    check('Shop2 suspended', shop2After?.status === 'suspended');
    check('Shop2 suspendedUntil = null (vô thời hạn)', shop2After?.suspendedUntil == null);

    console.log('\n== 3. Admin gỡ đình chỉ SỚM (tay) ==');
    const res3 = await shopReports.unsuspend(admin, String(shop1._id));
    check('unsuspend() trả về ok', res3.ok === true);
    const shop1After2 = await shopModel.findById(shop1._id).lean();
    check('Shop1 trở lại active', shop1After2?.status === 'active');
    check('Shop1 suspendedUntil được xoá về null', shop1After2?.suspendedUntil == null);
    const notif3 = await notifModel
      .findOne({ user: owner1._id, type: 'shop_suspension_lifted' })
      .lean();
    check('Chủ shop1 nhận thông báo gỡ đình chỉ', !!notif3);

    console.log('\n== 4. Gỡ đình chỉ khi shop KHÔNG bị đình chỉ -> báo lỗi ==');
    let threw = false;
    try {
      await shopReports.unsuspend(admin, String(shop1._id));
    } catch {
      threw = true;
    }
    check('Gỡ đình chỉ shop đang active bị từ chối', threw);

    console.log('\n== 5. Đình chỉ vô thời hạn vẫn gỡ tay được (shop2) ==');
    const res5 = await shopReports.unsuspend(admin, String(shop2._id));
    check('unsuspend() cho shop vô thời hạn thành công', res5.ok === true);
    const shop2After2 = await shopModel.findById(shop2._id).lean();
    check('Shop2 trở lại active', shop2After2?.status === 'active');

    console.log('\n== 6. Đình chỉ lại (tái phạm) với hạn khác — không lỗi khi Redis tắt ==');
    const owner3 = await mkOwner();
    const shop3 = await mkShop(owner3._id, 'ZZ Suspend Shop 3');
    await shopReports.create(reporter, {
      shopId: String(shop3._id),
      reasonType: 'counterfeit',
      detail: 'Lần đầu vi phạm.',
    });
    await shopReports.resolve(admin, String(shop3._id), {
      action: 'suspend',
      note: 'Đình chỉ 14 ngày lần đầu.',
      suspendDays: 14,
    });
    await shopReports.unsuspend(admin, String(shop3._id)); // gỡ sớm
    await shopReports.create(reporter, {
      shopId: String(shop3._id),
      reasonType: 'counterfeit',
      detail: 'Tái phạm lần hai.',
    });
    await shopReports.resolve(admin, String(shop3._id), {
      action: 'suspend',
      note: 'Tái phạm — đình chỉ 30 ngày.',
      suspendDays: 30,
    });
    const shop3After = await shopModel.findById(shop3._id).lean();
    check(
      'Đình chỉ lại với hạn mới không lỗi, suspendedUntil cập nhật ~30 ngày',
      !!shop3After?.suspendedUntil &&
        shop3After.suspendedUntil.getTime() > Date.now() + 29 * 86_400_000,
      shop3After?.suspendedUntil,
    );

    console.log('\n== 7. Dọn dẹp ==');
    await shopReports.unsuspend(admin, String(shop3._id)).catch(() => undefined);
    check('Dọn xong', true);
  } finally {
    await notifModel.deleteMany({ user: { $in: userIds } });
    await reportModel.deleteMany({ shop: { $in: shopIds } });
    await shopModel.deleteMany({ _id: { $in: shopIds } });
    await userModel.deleteMany({ _id: { $in: userIds } });
    await app.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
