// src/modules/auth/guards/jwt-auth.guard.ts
import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // DEV BYPASS: Automatically inject the first user if in development to allow dashboard testing
    if (process.env.NODE_ENV !== 'production') {
      const request = context.switchToHttp().getRequest();
      try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const testUser = await prisma.user.findFirst({
          include: { tenant: true }
        });
        if (testUser) {
          request.user = testUser;
          await prisma.$disconnect();
          return true; // Bypass real JWT validation
        }
        await prisma.$disconnect();
      } catch (e) {
        console.error('Failed to inject test user', e);
      }
    }
    
    const result = super.canActivate(context);
    return result instanceof Promise ? await result : result as any;
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
