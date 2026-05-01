import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private redisService: RedisService,
  ) {}

  private generateSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 10000);
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const result = await this.prisma.$transaction(async (prisma: any) => {
      const tenant = await prisma.tenant.create({
        data: {
          name: dto.companyName,
          slug: this.generateSlug(dto.companyName),
        },
      });

      const user = await prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          password: hashedPassword,
          role: UserRole.OWNER,
          tenantId: tenant.id,
        },
      });

      return { user, tenant };
    });

    return this.generateTokens(result.user.id, result.user.email, result.tenant.id);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user.id, user.email, user.tenantId);
  }

  async googleLogin(req: any) {
    if (!req.user) {
      throw new UnauthorizedException('No user from google');
    }

    const { email, firstName, lastName, picture } = req.user;
    const name = `${firstName} ${lastName}`;

    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Create tenant and user for new Google signup
      const result = await this.prisma.$transaction(async (prisma: any) => {
        const tenant = await prisma.tenant.create({
          data: {
            name: `${name}'s Workspace`,
            slug: this.generateSlug(name),
          },
        });

        const newUser = await prisma.user.create({
          data: {
            email,
            name,
            role: UserRole.OWNER,
            tenantId: tenant.id,
            avatarUrl: picture,
          },
        });

        return { user: newUser, tenant };
      });
      user = result.user;
    }

    return this.generateTokens(user!.id, user!.email, user!.tenantId);
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const isValid = await this.redisService.validateSession(userId, refreshToken);
    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.generateTokens(user.id, user.email, user.tenantId);
  }

  async logout(userId: string) {
    await this.redisService.clearSession(userId);
    return { success: true };
  }

  private async generateTokens(userId: string, email: string, tenantId: string) {
    const payload = { sub: userId, email, tenantId };
    
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { expiresIn: '15m' }),
      this.jwtService.signAsync(payload, { expiresIn: '7d', secret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret' }),
    ]);

    // Store refresh token in redis
    await this.redisService.setSession(userId, refreshToken, 7 * 24 * 60 * 60);

    return {
      accessToken,
      refreshToken,
      user: { id: userId, email, tenantId }
    };
  }
}
