import { prisma } from "@/lib/db";

export type ActivityInput = {
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  description?: string | null;
  ipAddress?: string | null;
};

/** Catat aktivitas penting. Kegagalan logging tidak boleh menggagalkan aksi utama. */
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        description: input.description ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error("[activity] gagal mencatat aktivitas", error);
  }
}
