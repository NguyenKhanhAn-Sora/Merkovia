import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

@Controller('admin/audit-log')
@UseGuards(AdminAuthGuard)
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  list(@Query() query: QueryAuditLogDto) {
    return this.auditLog.list(query.page, query.limit);
  }
}
