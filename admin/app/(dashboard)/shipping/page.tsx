"use client";

import { PencilSimple, Plus } from "@phosphor-icons/react";
import {
  DataTable,
  GhostButton,
  Panel,
  PageHeader,
  PreviewNote,
  PrimaryButton,
  Td,
  formatVnd,
} from "../../../components/dashboard/ui";

interface Rate {
  zone: string;
  weight: string;
  fee: number;
}

const RATES: Rate[] = [
  { zone: "Nội thành (cùng tỉnh/thành)", weight: "0 – 1kg", fee: 15_000 },
  { zone: "Nội thành (cùng tỉnh/thành)", weight: "1 – 3kg", fee: 22_000 },
  { zone: "Miền Bắc – Miền Nam / Miền Trung", weight: "0 – 1kg", fee: 28_000 },
  { zone: "Miền Bắc – Miền Nam / Miền Trung", weight: "1 – 3kg", fee: 39_000 },
  { zone: "Vùng sâu, vùng xa, hải đảo", weight: "0 – 1kg", fee: 45_000 },
  { zone: "Vùng sâu, vùng xa, hải đảo", weight: "1 – 3kg", fee: 62_000 },
];

export default function ShippingPage() {
  return (
    <div>
      <PageHeader
        title="Vận chuyển"
        description="Biểu cước tính theo vùng và khối lượng, áp dụng chung toàn sàn."
        action={
          <PrimaryButton icon={Plus} disabled>
            Thêm mức cước
          </PrimaryButton>
        }
      />
      <PreviewNote />

      <Panel padded={false} className="overflow-hidden">
        <DataTable columns={["Vùng giao hàng", "Khối lượng", "Phí vận chuyển", ""]}>
          {RATES.map((r, i) => (
            <tr key={i}>
              <Td className="font-medium text-star/85">{r.zone}</Td>
              <Td className="text-star/60">{r.weight}</Td>
              <Td className="text-star/85">{formatVnd(r.fee)}</Td>
              <Td>
                <GhostButton icon={PencilSimple} disabled className="h-9 px-3 text-[13px]">
                  Sửa
                </GhostButton>
              </Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
}
