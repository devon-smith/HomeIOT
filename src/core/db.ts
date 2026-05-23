import { PrismaClient } from "@prisma/client";
import { config } from "../config.js";
import { log } from "./log.js";

export const prisma = new PrismaClient({
  datasources: { db: { url: config.DATABASE_URL } },
  log: config.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

export async function connectDb(): Promise<void> {
  await prisma.$connect();
  log.info("postgres connected");
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
