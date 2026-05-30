import { ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@m/db";

// Asserts the caller is a member (owner OR partner) of the project.
// A member is any row in project_members for (projectId, userId).
export async function assertMember(
  prisma: Pick<PrismaClient, "projectMember">,
  projectId: string,
  userId: string,
): Promise<void> {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) throw new ForbiddenException("not a member of this project");
}
