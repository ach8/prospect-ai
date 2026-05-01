import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    console.log('✅ Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Helper method to enforce tenant isolation in queries
  forTenant(tenantId: string) {
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }: any) {
            // Models that don't have a tenantId should not be filtered
            const unscopedModels = ['Tenant'];
            
            if (!unscopedModels.includes(model)) {
              const operationsWithWhere = ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'update', 'updateMany', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy', 'upsert'];
              
              if (operationsWithWhere.includes(operation)) {
                if (args.where) {
                  args.where = { ...args.where, tenantId };
                } else {
                  args.where = { tenantId };
                }
              }
              
              if (operation === 'create' || operation === 'createMany' || operation === 'upsert') {
                if (args.data && !Array.isArray(args.data)) {
                  args.data = { ...args.data, tenantId };
                } else if (Array.isArray(args.data)) {
                  args.data = args.data.map((item: any) => ({ ...item, tenantId }));
                }
                if (operation === 'upsert' && args.create) {
                  args.create = { ...args.create, tenantId };
                }
              }
            }
            return query(args);
          },
        },
      },
    });
  }
}
