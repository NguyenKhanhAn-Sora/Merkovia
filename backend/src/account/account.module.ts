import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountController } from './account.controller';
import { AccountProfileService } from './account-profile.service';
import { AccountBackfillService } from './account-backfill.service';
import { FavoritesService } from './favorites.service';
import { UsersModule } from '../users/users.module';
import { Favorite, FavoriteSchema } from './schemas/favorite.schema';
import { ProfilesModule } from '../profiles/profiles.module';
import { AddressesModule } from '../addresses/addresses.module';
import { ProductsModule } from '../products/products.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Khu vực tài khoản của NGƯỜI MUA: hồ sơ, sổ địa chỉ, danh sách yêu thích.
 *
 * Tách khỏi `AuthModule` (vốn lo đăng nhập/đăng ký) vì đây là nghiệp vụ sau
 * đăng nhập và sẽ còn phình thêm (đánh giá đã viết, mã giảm giá, thông báo…).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Favorite.name, schema: FavoriteSchema },
    ]),
    ProfilesModule,
    AddressesModule,
    ProductsModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [AccountController],
  providers: [AccountProfileService, AccountBackfillService, FavoritesService],
})
export class AccountModule {}
