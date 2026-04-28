import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProspectsModule } from './modules/prospects/prospects.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { AuthModule } from './modules/auth/auth.module';
import { AiAgentsModule } from './modules/ai-agents/ai-agents.module';
import { PrismaModule } from './common/prisma/prisma.module';

@Module({
  imports: [
    // Load environment variables globally
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Core modules
    PrismaModule,
    AuthModule,

    // Feature modules
    ProspectsModule,
    CampaignsModule,
    AiAgentsModule,
  ],
})
export class AppModule {}
