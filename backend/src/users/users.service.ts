import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  findByEmail(email: string) {
    return this.userModel.findOne({ email: email.trim().toLowerCase() }).exec();
  }

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  /** Tạo tài khoản buyer đã xác thực email (dùng ở bước hoàn tất đăng ký). */
  createEmailBuyer(data: { email: string; passwordHash: string }) {
    return this.userModel.create({
      email: data.email.trim().toLowerCase(),
      passwordHash: data.passwordHash,
      emailVerified: true,
      roles: ['buyer'],
      status: 'active',
    });
  }
}
