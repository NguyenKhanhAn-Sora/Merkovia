import {
  ChartLineUp,
  ClockCounterClockwise,
  Flag,
  Gear,
  Image,
  Megaphone,
  Package,
  Receipt,
  Star,
  Storefront,
  Tag,
  Truck,
  Users,
  Wallet,
  type Icon,
} from "@phosphor-icons/react";

export interface NavItem {
  href: string;
  label: string;
  icon: Icon;
  /** Nhóm để chia section trong sidebar. */
  group: "Tổng quan" | "Vận hành sàn" | "Tài chính" | "Hệ thống";
}

/**
 * Điều hướng dashboard quản trị — bám theo các thực thể ĐÃ CÓ trong hệ thống
 * Merkovia (không dựng mục cho tính năng chưa tồn tại): tài khoản → gian
 * hàng → hàng hoá → đơn hàng → đánh giá, rồi tới tiền (khuyến mãi, vận
 * chuyển, đối soát), cuối cùng là vận hành nội bộ.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Tổng quan", icon: ChartLineUp, group: "Tổng quan" },
  { href: "/users", label: "Người dùng", icon: Users, group: "Vận hành sàn" },
  { href: "/shops", label: "Gian hàng", icon: Storefront, group: "Vận hành sàn" },
  { href: "/reports", label: "Báo cáo", icon: Flag, group: "Vận hành sàn" },
  { href: "/products", label: "Sản phẩm", icon: Package, group: "Vận hành sàn" },
  { href: "/categories", label: "Danh mục", icon: Tag, group: "Vận hành sàn" },
  { href: "/banners", label: "Banner trang chủ", icon: Image, group: "Vận hành sàn" },
  { href: "/orders", label: "Đơn hàng", icon: Receipt, group: "Vận hành sàn" },
  { href: "/reviews", label: "Đánh giá", icon: Star, group: "Vận hành sàn" },
  { href: "/promotions", label: "Khuyến mãi", icon: Megaphone, group: "Tài chính" },
  { href: "/shipping", label: "Vận chuyển", icon: Truck, group: "Tài chính" },
  { href: "/payouts", label: "Đối soát & Rút tiền", icon: Wallet, group: "Tài chính" },
  {
    href: "/audit-log",
    label: "Nhật ký hoạt động",
    icon: ClockCounterClockwise,
    group: "Hệ thống",
  },
  { href: "/settings", label: "Cài đặt", icon: Gear, group: "Hệ thống" },
];

export const NAV_GROUPS = ["Tổng quan", "Vận hành sàn", "Tài chính", "Hệ thống"] as const;

/** Mục đang active: khớp chính xác với "/", khớp tiền tố với các route con. */
export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
