import { Module } from '@nestjs/common';
import {
  ShippingProvider,
  TableShippingProvider,
} from './shipping.provider';

/**
 * Tính cước vận chuyển.
 *
 * Đổi sang hãng thật (GHN / GHTK / Viettel Post) chỉ là viết một lớp con của
 * `ShippingProvider` rồi đổi dòng dưới đây — nghiệp vụ đơn hàng và giao diện
 * không phải sửa gì.
 */
@Module({
  providers: [{ provide: ShippingProvider, useClass: TableShippingProvider }],
  exports: [ShippingProvider],
})
export class ShippingModule {}
