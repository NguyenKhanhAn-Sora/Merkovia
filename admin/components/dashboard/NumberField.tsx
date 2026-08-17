"use client";

import { useEffect, useState } from "react";

/**
 * Ô nhập số dùng chung cho các form cấu hình (Vận chuyển, Cài đặt...).
 *
 * Gõ chuỗi cục bộ thay vì bám thẳng vào `value` (number): input number có
 * kiểm soát mà đưa thẳng number vào dễ bị dính số 0 thừa phía trước (gõ "0"
 * rồi "7" thành "07") vì React không ép ghi lại DOM khi giá trị SỐ không đổi
 * dù chuỗi hiển thị khác. Chỉ đồng bộ lại từ ngoài (reload/lưu xong) khi ô
 * KHÔNG đang được gõ, để không giật lại chữ đang gõ dở của người dùng.
 *
 * `decimals = 0` (mặc định) ép về số nguyên trên mỗi lần gõ — dùng cho giờ,
 * ngày. `decimals > 0` (vd hoa hồng %) không ép làm tròn giữa chừng — để
 * không phá dở khi đang gõ "0.05" — chỉ làm tròn gọn lúc rời ô.
 */
export default function NumberField({
  label,
  suffix,
  value,
  onChange,
  min = 0,
  decimals = 0,
}: {
  label: string;
  suffix: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  decimals?: number;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const clamp = (n: number) => Math.max(min, n);
  const roundToDecimals = (n: number) => {
    const factor = 10 ** decimals;
    return Math.round(n * factor) / factor;
  };

  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-star/60">{label}</span>
      <div className="relative">
        <input
          type="number"
          min={min}
          step={decimals > 0 ? 10 ** -decimals : 1}
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            // Bỏ số 0 thừa ở đầu ngay khi gõ (giữ lại "0" đơn lẻ nếu cả ô chỉ có nó).
            const raw = e.target.value.replace(/^0+(?=\d)/, "");
            setText(raw);
            const n = Number(raw);
            if (raw === "" || !Number.isFinite(n)) return;
            onChange(clamp(decimals > 0 ? n : Math.round(n)));
          }}
          onBlur={() => {
            setFocused(false);
            // Rời ô mà để trống hoặc chỉ có ký tự rác thì trả về giá trị hợp lệ gần nhất.
            const n = clamp(roundToDecimals(Number(text) || 0));
            setText(String(n));
            onChange(n);
          }}
          className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-3 pr-12 text-[13.5px] text-star outline-none transition-colors focus:border-cosmic-violet/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-star/35">
          {suffix}
        </span>
      </div>
    </label>
  );
}
