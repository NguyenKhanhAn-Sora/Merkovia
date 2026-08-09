import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { LockUserDto, QueryAdminUsersDto } from './dto/admin-users.dto';
import { AdminAuthGuard, CurrentAdmin } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';

@Controller('admin/users')
@UseGuards(AdminAuthGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@Query() query: QueryAdminUsersDto) {
    return this.users.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.users.detail(id);
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  lock(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: LockUserDto,
  ) {
    return this.users.lock(admin, id, dto.reason);
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  unlock(@CurrentAdmin() admin: AdminPrincipal, @Param('id') id: string) {
    return this.users.unlock(admin, id);
  }
}
