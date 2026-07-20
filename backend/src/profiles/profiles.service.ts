import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Gender, Profile, ProfileDocument } from './schemas/profile.schema';

export interface CreateProfileInput {
  userId: string;
  fullName?: string;
  displayName?: string;
  username?: string;
  dateOfBirth?: Date;
  gender?: Gender;
  bio?: string;
  avatarUrl?: string;
}

@Injectable()
export class ProfilesService {
  constructor(
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
  ) {}

  findByUser(userId: string) {
    return this.profileModel.findOne({ user: new Types.ObjectId(userId) }).exec();
  }

  create(input: CreateProfileInput) {
    const { userId, ...rest } = input;
    return this.profileModel.create({
      user: new Types.ObjectId(userId),
      ...rest,
    });
  }
}
