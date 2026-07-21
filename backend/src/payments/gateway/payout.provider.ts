import { Injectable, Logger } from '@nestjs/common';

export type TransferStatus = 'processing' | 'paid' | 'failed';

export interface TransferInput {
  /** Mã lệnh phía Merkovia — cũng là khoá chống chuyển trùng phía nhà cung cấp. */
  code: string;
  amount: number;
  bankBin: string;
  accountNumber: string;
  accountHolderName: string;
  description: string;
}

export interface TransferResult {
  providerRef: string;
  status: TransferStatus;
  failureReason?: string;
}

/**
 * Chuyển tiền ra ngoài (chi trả cho người bán).
 *
 * Tách riêng khỏi cổng thu tiền vì thực tế thường là hai dịch vụ khác nhau, và
 * quyền chi tiền nhạy cảm hơn hẳn quyền thu tiền — nên khoá và nhật ký cũng
 * phải tách.
 */
export abstract class PayoutProvider {
  abstract readonly name: string;
  abstract readonly isReal: boolean;

  abstract transfer(input: TransferInput): Promise<TransferResult>;
  abstract getStatus(providerRef: string): Promise<TransferStatus>;
}

/**
 * Chi trả giả lập — KHÔNG chuyển tiền thật.
 *
 * Có đường thất bại tất định (số tài khoản kết thúc `9999`) để thử được nhánh
 * chuyển tiền hỏng mà không cần nhà cung cấp thật.
 */
@Injectable()
export class MockPayoutProvider extends PayoutProvider {
  readonly name = 'Chi trả giả lập (môi trường phát triển)';
  readonly isReal = false;

  private readonly logger = new Logger(MockPayoutProvider.name);
  private readonly transfers = new Map<string, TransferStatus>();

  transfer(input: TransferInput): Promise<TransferResult> {
    const providerRef = `MOCKPO-${input.code}`;

    if (input.accountNumber.endsWith('9999')) {
      this.transfers.set(providerRef, 'failed');
      return Promise.resolve({
        providerRef,
        status: 'failed',
        failureReason: 'Ngân hàng từ chối: tài khoản không nhận được tiền.',
      });
    }

    this.logger.warn(
      `Chi trả GIẢ LẬP ${input.code}: ${input.amount}đ → ${input.accountNumber}.`,
    );
    this.transfers.set(providerRef, 'paid');
    return Promise.resolve({ providerRef, status: 'paid' });
  }

  getStatus(providerRef: string): Promise<TransferStatus> {
    return Promise.resolve(this.transfers.get(providerRef) ?? 'failed');
  }
}
