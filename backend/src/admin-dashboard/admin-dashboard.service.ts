import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import {
  Order,
  OrderDocument,
  TERMINAL_STATUS,
} from '../orders/schemas/order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import {
  ShopReport,
  ShopReportDocument,
} from '../shop-reports/schemas/shop-report.schema';
import { Payout, PayoutDocument } from '../payments/schemas/payout.schema';
import { AuditLogService } from '../audit-log/audit-log.service';

/**
 * Số liệu tổng quan cho trang chủ Kênh Quản trị — gộp từ mọi module bằng
 * truy vấn/đếm trực tiếp trên model (không phụ thuộc service của module khác)
 * để tránh kéo theo hàng loạt dependency chỉ để đọc vài con số.
 */
@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(ShopReport.name)
    private readonly reportModel: Model<ShopReportDocument>,
    @InjectModel(Payout.name)
    private readonly payoutModel: Model<PayoutDocument>,
    private readonly auditLog: AuditLogService,
  ) {}

  async overview() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const since30d = new Date(Date.now() - 30 * 86_400_000);

    const [
      totalUsers,
      activeShops,
      suspendedShops,
      ordersToday,
      revenueTodayAgg,
      recentOrders,
      pendingReportShops,
      pendingProducts,
      failedPayoutsAgg,
      successRateAgg,
      recentActivity,
    ] = await Promise.all([
      this.userModel.countDocuments({ deletedAt: null }),
      this.shopModel.countDocuments({ status: 'active' }),
      this.shopModel.countDocuments({ status: 'suspended' }),
      this.orderModel.countDocuments({ createdAt: { $gte: startOfToday } }),
      this.orderModel.aggregate<{ _id: null; total: number }>([
        {
          $match: {
            createdAt: { $gte: startOfToday },
            status: { $ne: 'cancelled' },
          },
        },
        { $group: { _id: null, total: { $sum: '$itemsTotal' } } },
      ]),
      this.orderModel
        .find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('shop', 'name')
        .lean(),
      // Gian hàng khác nhau đang có báo cáo `pending` — vài dòng gần nhất cho panel.
      this.reportModel.aggregate<{ _id: string; latestAt: Date }>([
        { $match: { status: 'pending' } },
        { $group: { _id: '$shop', latestAt: { $max: '$createdAt' } } },
        { $sort: { latestAt: -1 } },
        { $limit: 5 },
      ]),
      this.productModel.countDocuments({
        deletedAt: null,
        'moderation.state': 'pending',
      }),
      this.payoutModel.aggregate<{ _id: null; total: number; count: number }>([
        { $match: { status: 'failed' } },
        {
          $group: {
            _id: null,
            total: { $sum: '$netAmount' },
            count: { $sum: 1 },
          },
        },
      ]),
      this.orderModel.aggregate<{ _id: string; count: number }>([
        {
          $match: {
            createdAt: { $gte: since30d },
            status: { $in: TERMINAL_STATUS as unknown as string[] },
          },
        },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.auditLog.recent(6),
    ]);

    const reportedShops = await this.shopModel
      .find({ _id: { $in: pendingReportShops.map((r) => r._id) } })
      .select('name')
      .lean();
    const shopNameById = new Map(
      reportedShops.map((s) => [String(s._id), s.name]),
    );

    const terminalCounts = Object.fromEntries(
      successRateAgg.map((r) => [r._id, r.count]),
    ) as Record<string, number>;
    const terminalTotal =
      (terminalCounts.delivered ?? 0) +
      (terminalCounts.cancelled ?? 0) +
      (terminalCounts.returned ?? 0);
    const successRate =
      terminalTotal > 0
        ? Math.round(((terminalCounts.delivered ?? 0) / terminalTotal) * 1000) /
          10
        : null;

    return {
      totalUsers,
      shops: { active: activeShops, suspended: suspendedShops },
      ordersToday,
      revenueToday: revenueTodayAgg[0]?.total ?? 0,
      recentOrders: recentOrders.map((o) => ({
        id: String(o._id),
        orderCode: o.orderCode,
        buyer: o.shippingAddress?.recipientName ?? '—',
        shopName: (o.shop as unknown as { name?: string })?.name ?? '—',
        total: o.itemsTotal,
        status: o.status,
      })),
      pendingReportShops: pendingReportShops.map((r) => ({
        shopId: String(r._id),
        shopName: shopNameById.get(String(r._id)) ?? '—',
        latestAt: r.latestAt,
      })),
      pendingProducts,
      failedPayouts: {
        count: failedPayoutsAgg[0]?.count ?? 0,
        total: failedPayoutsAgg[0]?.total ?? 0,
      },
      successRate,
      recentActivity,
    };
  }
}
