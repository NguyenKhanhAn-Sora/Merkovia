"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleNotch, FloppyDisk, Info } from "@phosphor-icons/react";
import { PageHeader, Panel, PanelHeader, PrimaryButton, formatVnd } from "../../../components/dashboard/ui";
import NumberField from "../../../components/dashboard/NumberField";
import {
  getShippingSettings,
  updateShippingSettings,
  type ShippingConstants,
  type ShippingSettings,
  type ZoneRate,
} from "../../../lib/shipping-api";

type ZoneKey = "intra_province" | "inter_province" | "long_haul";

const ZONE_LABEL: Record<ZoneKey, { title: string; hint: string }> = {
  intra_province: { title: "Nội tỉnh", hint: "Người gửi và người nhận cùng tỉnh/thành." },
  inter_province: { title: "Liên tỉnh", hint: "Khác tỉnh nhưng chưa tới ngưỡng tuyến xa bên dưới." },
  long_haul: { title: "Tuyến xa", hint: "Khoảng cách đường chim bay vượt ngưỡng tuyến xa." },
};


function ZoneCard({
  zoneKey,
  rate,
  onChange,
}: {
  zoneKey: ZoneKey;
  rate: ZoneRate;
  onChange: (next: ZoneRate) => void;
}) {
  const { title, hint } = ZONE_LABEL[zoneKey];
  return (
    <Panel>
      <p className="text-[14px] font-semibold text-star">{title}</p>
      <p className="mt-0.5 mb-4 text-[12px] leading-relaxed text-star/45">{hint}</p>
      <div className="space-y-3">
        <NumberField
          label="Cước cơ bản (gồm 1kg đầu)"
          suffix="đ"
          value={rate.base}
          onChange={(v) => onChange({ ...rate, base: v })}
        />
        <NumberField
          label="Phụ phí mỗi 500g tiếp theo"
          suffix="đ"
          value={rate.perHalfKg}
          onChange={(v) => onChange({ ...rate, perHalfKg: v })}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Giao tối thiểu"
            suffix="ngày"
            value={rate.etaMinDays}
            onChange={(v) => onChange({ ...rate, etaMinDays: v })}
          />
          <NumberField
            label="Giao tối đa"
            suffix="ngày"
            value={rate.etaMaxDays}
            onChange={(v) => onChange({ ...rate, etaMaxDays: v })}
          />
        </div>
      </div>
    </Panel>
  );
}

export default function ShippingPage() {
  const [saved, setSaved] = useState<ShippingSettings | null>(null);
  const [draft, setDraft] = useState<ShippingSettings | null>(null);
  const [constants, setConstants] = useState<ShippingConstants | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { settings, constants } = await getShippingSettings();
      setSaved(settings);
      setDraft(settings);
      setConstants(constants);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được biểu cước.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = draft && saved && JSON.stringify(draft) !== JSON.stringify(saved);

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    try {
      const { settings } = await updateShippingSettings(draft);
      setSaved(settings);
      setDraft(settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được thay đổi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Vận chuyển"
        description="Biểu cước tính theo vùng và khối lượng, áp dụng cho mọi đơn hàng đặt MỚI trên toàn sàn. Đơn đã đặt giữ nguyên cước đã chốt lúc đó."
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
          {saved.updatedAt ? ` · ${new Date(saved.updatedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}` : ""}
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
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {(["intra_province", "inter_province", "long_haul"] as ZoneKey[]).map((key) => (
              <ZoneCard
                key={key}
                zoneKey={key}
                rate={draft[key]}
                onChange={(next) => setDraft({ ...draft, [key]: next })}
              />
            ))}
          </div>

          <Panel className="mt-4">
            <PanelHeader title="Ngưỡng chung" description="Áp dụng cho toàn bộ đơn hàng, không phân biệt vùng." />
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Miễn phí vận chuyển từ"
                suffix="đ"
                value={draft.freeShippingThreshold}
                onChange={(v) => setDraft({ ...draft, freeShippingThreshold: v })}
              />
              <NumberField
                label="Ngưỡng tuyến xa (khoảng cách)"
                suffix="km"
                min={1}
                value={draft.longHaulKm}
                onChange={(v) => setDraft({ ...draft, longHaulKm: v })}
              />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-star/40">
              Đơn hàng có tiền hàng từ {formatVnd(draft.freeShippingThreshold)} trở lên được miễn phí vận chuyển.
              Hai điểm giao cách nhau từ {draft.longHaulKm}km trở lên (khi xác định được toạ độ cả hai đầu) mới
              tính là tuyến xa.
            </p>
          </Panel>

          {constants && (
            <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 text-[12.5px] leading-relaxed text-star/50">
              <Info size={16} className="mt-0.5 shrink-0 text-star/35" />
              <p>
                Hằng số kỹ thuật cố định (không sửa được ở đây, theo chuẩn ngành vận chuyển): khối lượng gồm sẵn
                trong cước cơ bản <strong className="text-star/70">{constants.INCLUDED_GRAM}g</strong>, hệ số quy
                đổi khối lượng theo thể tích{" "}
                <strong className="text-star/70">1 / {constants.VOLUMETRIC_DIVISOR.toLocaleString("vi-VN")}</strong>.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
