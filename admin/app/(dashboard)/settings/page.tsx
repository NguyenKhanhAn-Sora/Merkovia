"use client";

import { Envelope, LockKey, Percent, Star, Timer, Wallet } from "@phosphor-icons/react";
import { GhostButton, Panel, PanelHeader, PageHeader, PreviewNote } from "../../../components/dashboard/ui";

function ReadonlyField({
  label,
  value,
  icon: IconCmp,
  suffix,
}: {
  label: string;
  value: string;
  icon: typeof Star;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[13px] font-medium text-star/70">{label}</label>
      <div className="flex h-12 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-star/40">
        <IconCmp size={17} className="shrink-0" />
        <span className="flex-1 text-[14.5px] text-star/70">{value}</span>
        {suffix && <span className="text-[13px] text-star/35">{suffix}</span>}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Cài đặt" description="Cấu hình vận hành chung của sàn Merkovia." />
      <PreviewNote>
        Giao diện phác thảo — các thông số dưới đang hiển thị đúng giá trị cấu hình
        hiện tại của hệ thống (đọc từ backend), nhưng form chỉnh sửa chưa được đấu nối.
      </PreviewNote>

      <div className="flex flex-col gap-6">
        <Panel>
          <PanelHeader title="Tài khoản quản trị" description="Đăng nhập bằng tài khoản cấu hình trong .env của backend." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadonlyField label="Email quản trị" value="admin@merkovia.com" icon={Envelope} />
            <ReadonlyField label="Mật khẩu" value="••••••••••" icon={LockKey} suffix="Đổi qua .env" />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Tài chính & Đối soát" description="Ảnh hưởng trực tiếp tới doanh thu người bán — cần thận trọng khi đổi." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadonlyField label="Hoa hồng sàn" value="5%" icon={Percent} />
            <ReadonlyField label="Số ngày giữ tiền tối thiểu" value="3" icon={Wallet} suffix="ngày sau giao" />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Chính sách mua hàng" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadonlyField label="Hạn yêu cầu trả hàng" value="7" icon={Timer} suffix="ngày sau giao" />
            <ReadonlyField label="Hạn sửa đánh giá" value="48" icon={Star} suffix="giờ, 1 lần" />
          </div>
        </Panel>

        <Panel className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[14px] font-medium text-star/85">Lưu thay đổi</p>
            <p className="mt-1 text-[13px] text-star/45">
              Chức năng chỉnh sửa các thông số trên sẽ được bổ sung sau.
            </p>
          </div>
          <GhostButton disabled>Lưu thay đổi</GhostButton>
        </Panel>
      </div>
    </div>
  );
}
