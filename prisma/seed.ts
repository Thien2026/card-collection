import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function upsertAdmin(email: string, password: string, name: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role: UserRole.ADMIN },
    create: { name, email, passwordHash, role: UserRole.ADMIN },
  });
}

async function main() {
  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase().trim();
  const ownerPassword = process.env.OWNER_PASSWORD;
  const ownerName = process.env.OWNER_NAME?.trim() || "Quản trị viên";

  if (!ownerEmail || !ownerPassword) {
    throw new Error(
      "Thiếu OWNER_EMAIL / OWNER_PASSWORD trong .env — không seed được admin.",
    );
  }
  if (ownerPassword.length < 8) {
    throw new Error("OWNER_PASSWORD phải có ít nhất 8 ký tự.");
  }

  await upsertAdmin(ownerEmail, ownerPassword, ownerName);
  console.log(`Seeded admin: ${ownerEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
