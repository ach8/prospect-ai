import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ProspectsModule } from './modules/prospects/prospects.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { AuthModule } from './modules/auth/auth.module';
import { AiAgentsModule } from './modules/ai-agents/ai-agents.module';
import { AgentsModule } from './modules/agents/agents.module';
import { EnrichmentModule } from './modules/enrichment/enrichment.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { Redis } from 'ioredis';

@Module({
  imports: [
    // Load environment variables globally
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [{
        ttl: config.get('THROTTLE_TTL', 60000),
        limit: config.get('THROTTLE_LIMIT', 100),
      }],
    }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get('REDIS_URL', 'redis://localhost:6379');
        const options: any = {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        };
        
        // Si TLS (rediss)
        if (url.startsWith('rediss://')) {
          options.tls = { rejectUnauthorized: false };
        }
        
        return {
          connection: new Redis(url, options),
        };
      },
    }),

    // Core modules
    PrismaModule,
    RedisModule,
    AuthModule,

    // Feature modules
    ProspectsModule,
    CampaignsModule,
    AiAgentsModule,
    AgentsModule,
    EnrichmentModule,
    DashboardModule,
  ],
})
export class AppModule {}
