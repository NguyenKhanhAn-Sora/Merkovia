import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { BANKS, findBank } from './banks';
import { BankLookupProvider, nameMatches } from './bank-lookup.provider';
import { LookupBankAccountDto } from './dto/bank-account.dto';
import type { UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    private readonly lookupProvider: BankLookupProvider,
  ) {}

  private async requireShop(user: UserDocument): Promise<ShopDocument> {
    const shop = await this.shopModel.findOne({ owner: user._id });
    if (!shop) throw new ForbiddenException('Tài khoản chưa có gian hàng.');
    if (shop.status === 'suspended') {
      throw new ForbiddenException(
        'Gian hàng đang bị tạm đình chỉ, không thể thay đổi tài khoản nhận tiền.',
      );
    }
    return shop;
  }

  /** Danh sách ngân hàng cho ô chọn ở giao diện. */
  banks() {
    return {
      banks: BANKS,
      provider: {
        name: this.lookupProvider.name,
        isReal: this.lookupProvider.isReal,
      },
    };
  }

  /**
   * Tra cứu tên chủ tài khoản — KHÔNG lưu gì.
   *
   * Tách riêng khỏi bước lưu để người bán xem tên trả về rồi mới xác nhận. Nếu
   * gộp làm một, họ sẽ lưu nhầm tài khoản của người khác mà không kịp phát hiện.
   */
  async lookup(user: UserDocument, dto: LookupBankAccountDto) {
    await this.requireShop(user);

    const bank = findBank(dto.bankBin);
    if (!bank) {
      throw new BadRequestException('Ngân hàng không nằm trong danh sách hỗ trợ.');
    }

    let result: Awaited<ReturnType<BankLookupProvider['lookup']>>;
    try {
      result = await this.lookupProvider.lookup(dto.bankBin, dto.accountNumber);
    } catch (e: unknown) {
      // Dịch vụ hỏng KHÁC với số tài khoản sai — báo đúng để người bán biết
      // là nên thử lại sau chứ không phải sửa số.
      this.logger.error(`Tra cứu ngân hàng thất bại: ${String(e)}`);
      throw new ServiceUnavailableException(
        'Không kết nối được dịch vụ tra cứu ngân hàng. Vui lòng thử lại sau.',
      );
    }

    if (!result.ok || !result.accountHolderName) {
      throw new BadRequestException(
        result.reason ?? 'Không tìm thấy tài khoản ngân hàng này.',
      );
    }

    return {
      bank,
      accountNumber: dto.accountNumber,
      accountHolderName: result.accountHolderName,
      provider: {
        name: this.lookupProvider.name,
        isReal: this.lookupProvider.isReal,
      },
    };
  }

  /**
   * Liên kết tài khoản nhận tiền.
   *
   * Tra cứu LẠI thay vì tin kết quả client gửi lên — nếu không, chỉ cần gọi
   * thẳng API này với tên tự bịa là qua mặt được toàn bộ khâu xác thực.
   *
   * Cố ý KHÔNG áp thời gian chờ giữa hai lần đổi (khác quy tắc đổi tên shop 30
   * ngày): người bán gõ nhầm số tài khoản mà bị khoá thì họ không nhận được
   * tiền của chính mình. Đổi lại, mọi lần đổi đều phải xác thực lại và được
   * ghi vào `bankAccountHistory` để đối soát khi có tranh chấp.
   */
  async linkBankAccount(user: UserDocument, dto: LookupBankAccountDto) {
    const shop = await this.requireShop(user);
    const verified = await this.lookup(user, dto);

    const previous = shop.bankAccount;
    if (
      previous?.bankBin === dto.bankBin &&
      previous.accountNumber === dto.accountNumber
    ) {
      throw new BadRequestException(
        'Đây đang là tài khoản nhận tiền hiện tại của gian hàng.',
      );
    }

    if (previous) {
      shop.bankAccountHistory.push({
        at: new Date(),
        bankBin: previous.bankBin,
        accountNumber: previous.accountNumber,
        accountHolderName: previous.accountHolderName,
      });
    }

    shop.bankAccount = {
      bankBin: verified.bank.bin,
      bankName: verified.bank.shortName,
      bankCode: verified.bank.code,
      accountNumber: dto.accountNumber,
      accountHolderName: verified.accountHolderName,
      nameMatchesContact: nameMatches(
        verified.accountHolderName,
        shop.contactName,
      ),
      verifiedAt: new Date(),
      verifiedBy: this.lookupProvider.isReal ? this.lookupProvider.name : 'mock',
    };
    await shop.save();

    return { bankAccount: this.publicBankAccount(shop) };
  }

  async removeBankAccount(user: UserDocument) {
    const shop = await this.requireShop(user);
    if (!shop.bankAccount) {
      throw new BadRequestException('Gian hàng chưa liên kết tài khoản nào.');
    }

    shop.bankAccountHistory.push({
      at: new Date(),
      bankBin: shop.bankAccount.bankBin,
      accountNumber: shop.bankAccount.accountNumber,
      accountHolderName: shop.bankAccount.accountHolderName,
    });
    shop.bankAccount = undefined;
    await shop.save();

    return { bankAccount: null };
  }

  async myBankAccount(user: UserDocument) {
    const shop = await this.requireShop(user);
    return {
      bankAccount: this.publicBankAccount(shop),
      provider: {
        name: this.lookupProvider.name,
        isReal: this.lookupProvider.isReal,
      },
    };
  }

  /**
   * Che bớt số tài khoản khi trả ra ngoài.
   * Người bán chỉ cần thấy 4 số cuối để nhận ra đúng tài khoản của mình; hiện
   * đủ số thì ai nhìn trộm màn hình cũng lấy được.
   */
  private publicBankAccount(shop: ShopDocument) {
    const b = shop.bankAccount;
    if (!b) return null;
    return {
      bankBin: b.bankBin,
      bankName: b.bankName,
      bankCode: b.bankCode,
      accountNumberMasked: maskAccount(b.accountNumber),
      accountHolderName: b.accountHolderName,
      nameMatchesContact: b.nameMatchesContact,
      verifiedAt: b.verifiedAt,
      /** `false` = xác thực bằng dữ liệu giả lập, chưa dùng để chi tiền thật. */
      verifiedReal: b.verifiedBy !== 'mock',
    };
  }
}

export function maskAccount(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  return `${'•'.repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}`;
}
