import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const existingUser = await prisma.user.findUnique({ where: { email: 'test@example.com' } });
  if (existingUser) {
    console.log('Test user already exists!');
    return;
  }

  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Acme Corp',
      slug: 'acme-corp-' + Math.floor(Math.random() * 10000),
    }
  });

  const user = await prisma.user.create({
    data: {
      email: 'test@example.com',
      name: 'Test User',
      password: hashedPassword,
      role: UserRole.OWNER,
      tenantId: tenant.id
    }
  });

  console.log('User created:', user.email);
}

main().catch(console.error).finally(() => prisma.$disconnect());
