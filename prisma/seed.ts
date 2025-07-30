import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.org.findFirst();
  if (existing) {
    console.log("Org already exists with id", existing.id);
    return;
  }

  const org = await prisma.org.create({
    data: {
      name: "Default Org",
    },
  });

  console.log("Created default org with id", org.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
