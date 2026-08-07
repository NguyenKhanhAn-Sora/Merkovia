import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';

@Controller('admin/audit-log')
@UseGuards(AdminAuthGuard)
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.auditLog.list(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
    );
  }
}
