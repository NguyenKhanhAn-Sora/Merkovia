"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleNotch, Envelope, FloppyDisk, Info, LockKey } from "@phosphor-icons/react";
import { PageHeader, Panel, PanelHeader, PrimaryButton } from "../../../components/dashboard/ui";
import NumberField from "../../../components/dashboard/NumberField";
import {
  getPlatformSettings,
  updatePlatformSettings,
  type PlatformSettings,
} from "../../../lib/platform-settings-api";

function ReadonlyField({
  label,
  value,
  icon: IconCmp,
  suffix,
}: {
  label: string;
  value: string;
  icon: typeof Envelope;
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
  const [saved, setSaved] = useState<PlatformSettings | null>(null);
  const [draft, setDraft] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const s = await getPlatformSettings();
      setSaved(s);
      setDraft(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được cấu hình.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = draft && saved && JSON.stringify(draft) !== JSON.stringify(saved);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const s = await updatePlatformSettings(draft);
      setSaved(s);
      setDraft(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được thay đổi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Cài đặt"
        description="Chính sách vận hành toàn sàn — áp dụng ngay khi lưu, không cần deploy lại."
        action={
          <PrimaryButton icon={saving ? undefined : FloppyDisk} onClick={() => void save()} disabled={!dirty || saving}>
            {saving && <CircleNotch size={15} className="animate-spin" />}
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </PrimaryButton>
        }
      />

      {saved?.updatedBy && (
        <p className="mb-5 text-[12.5px] text-star/40">
          Cập nhật lần cuối bởi {saved.updatedBy}
          {saved.updatedAt
            ? ` · ${new Date(saved.updatedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}`
            : ""}
        </p>
      )}

      {error && (
        <p className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-200">
          {error}
        </p>
      )}

      {loading || !draft ? (
        <div className="flex justify-center py-16">
          <CircleNotch size={22} className="animate-spin text-star/40" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader
              title="Tài khoản quản trị"
              description="Đăng nhập bằng tài khoản cấu hình trong .env của backend."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ReadonlyField label="Email quản trị" value="Cấu hình qua ADMIN_EMAIL" icon={Envelope} />
              <ReadonlyField label="Mật khẩu" value="••••••••••" icon={LockKey} suffix="Đổi qua .env" />
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Tài chính & Đối soát"
              description="Ảnh hưởng trực tiếp tới số dư khả dụng của người bán — cần thận trọng khi đổi."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberField
                label="Hoa hồng sàn"
                suffix="%"
                min={0}
                decimals={1}
                value={Math.round(draft.commissionRate * 1000) / 10}
                onChange={(v) => setDraft({ ...draft, commissionRate: v / 100 })}
              />
              <NumberField
                label="Số ngày giữ tiền tối thiểu"
                suffix="ngày sau giao"
                min={0}
                value={draft.payoutHoldDays}
                onChange={(v) => setDraft({ ...draft, payoutHoldDays: v })}
              />
            </div>
            <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-star/40">
              <Info size={14} className="mt-0.5 shrink-0" />
              Mỗi lần lưu chỉ được đổi hoa hồng tối đa ±2 điểm phần trăm — chia thành nhiều lần lưu nếu thực sự cần
              đổi nhiều hơn, để tránh gõ nhầm gây thiệt hại lớn. Số dư &ldquo;khả dụng/đang giữ&rdquo; của người bán
              đổi theo ngay lập tức; các đợt rút tiền đã yêu cầu trước đó không bị ảnh hưởng.
            </p>
          </Panel>

          <Panel>
            <PanelHeader
              title="Vận hành đơn hàng (SLA người bán)"
              description="Áp dụng cho đơn chuyển trạng thái SAU khi lưu — đơn đang chờ xử lý giữ nguyên hạn cũ."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberField
                label="Hạn xác nhận đơn"
                suffix="giờ"
                min={1}
                value={draft.orderConfirmHours}
                onChange={(v) => setDraft({ ...draft, orderConfirmHours: v })}
              />
              <NumberField
                label="Mốc nhắc trước hạn xác nhận"
                suffix="giờ"
                min={1}
                value={draft.orderConfirmWarnHours}
                onChange={(v) => setDraft({ ...draft, orderConfirmWarnHours: v })}
              />
              <NumberField
                label="Hạn bàn giao vận chuyển"
                suffix="giờ"
                min={1}
                value={draft.orderShipHours}
                onChange={(v) => setDraft({ ...draft, orderShipHours: v })}
              />
              <NumberField
                label="Mốc nhắc trước hạn bàn giao"
                suffix="giờ"
                min={1}
                value={draft.orderShipWarnHours}
                onChange={(v) => setDraft({ ...draft, orderShipWarnHours: v })}
              />
            </div>
            <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-star/40">
              <Info size={14} className="mt-0.5 shrink-0" />
              Mốc nhắc phải nhỏ hơn hạn tương ứng — hệ thống nhắc người bán trước, chỉ tự huỷ đơn nếu vẫn không xử lý
              tới hạn.
            </p>
          </Panel>

          <Panel>
            <PanelHeader
              title="Chính sách với người mua"
              description="Đọc trực tiếp mỗi lần kiểm tra — thay đổi có hiệu lực NGAY cho cả đơn/đánh giá đã có, không chỉ cái mới."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberField
                label="Hạn yêu cầu trả hàng"
                suffix="ngày sau giao"
                min={0}
                value={draft.returnWindowDays}
                onChange={(v) => setDraft({ ...draft, returnWindowDays: v })}
              />
              <NumberField
                label="Hạn sửa đánh giá"
                suffix="giờ, 1 lần"
                min={1}
                value={draft.reviewEditWindowHours}
                onChange={(v) => setDraft({ ...draft, reviewEditWindowHours: v })}
              />
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Kiểm duyệt báo cáo vi phạm"
              description="Ngưỡng điểm xếp bậc ưu tiên hàng đợi báo cáo — chỉ ảnh hưởng cách admin nhìn hàng đợi."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <NumberField
                label="Ngưỡng khẩn cấp"
                suffix="điểm"
                min={0}
                decimals={1}
                value={draft.reportUrgentScore}
                onChange={(v) => setDraft({ ...draft, reportUrgentScore: v })}
              />
              <NumberField
                label="Ngưỡng cao"
                suffix="điểm"
                min={0}
                decimals={1}
                value={draft.reportHighScore}
                onChange={(v) => setDraft({ ...draft, reportHighScore: v })}
              />
              <NumberField
                label="Ngưỡng trung bình"
                suffix="điểm"
                min={0}
                decimals={1}
                value={draft.reportMediumScore}
                onChange={(v) => setDraft({ ...draft, reportMediumScore: v })}
              />
            </div>
            <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-star/40">
              <Info size={14} className="mt-0.5 shrink-0" />
              Ngưỡng phải giảm dần: khẩn cấp ≥ cao ≥ trung bình.
            </p>
          </Panel>
        </div>
      )}
    </div>
  );
}
