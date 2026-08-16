import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const list = await prisma.prospectList.findFirst({
    where: { name: { contains: "agence", mode: "insensitive" } },
    include: { prospects: { include: { prospect: true } } }
  });
  if (!list) {
    console.log("List not found");
    return;
  }
  console.log("List found:", list.name);
  const prospects = list.prospects.map(p => p.prospect);
  const withEmail = prospects.filter(p => p.email);
  const valid = withEmail.filter(p => p.emailVerified);
  const confidence50 = withEmail.filter(p => p.emailConfidence === 50);
  const confidence99 = withEmail.filter(p => p.emailConfidence === 99);
  const confidence95 = withEmail.filter(p => p.emailConfidence === 95);
  const confidence90 = withEmail.filter(p => p.emailConfidence === 90);
  const confidence75 = withEmail.filter(p => p.emailConfidence === 75);
  
  console.log(`Total prospects: ${prospects.length}`);
  console.log(`With email: ${withEmail.length}`);
  console.log(`Email verified: ${valid.length}`);
  console.log(`Confidence 99 (Safe API/SMTP): ${confidence99.length}`);
  console.log(`Confidence 95 (Gemini OSINT): ${confidence95.length}`);
  console.log(`Confidence 90 (Pattern/Anymail): ${confidence90.length}`);
  console.log(`Confidence 75 (Permutation): ${confidence75.length}`);
  console.log(`Confidence 50 (Catch-all): ${confidence50.length}`);
  
  // Show a few examples
  console.log("--- Examples of Catch-all ---");
  console.log(confidence50.slice(0, 3).map(p => `${p.email} (conf: ${p.emailConfidence}, verified: ${p.emailVerified})`));
}
main().catch(console.error).finally(() => prisma.$disconnect());
