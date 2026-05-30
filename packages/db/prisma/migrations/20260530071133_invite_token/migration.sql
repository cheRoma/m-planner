-- CreateTable
CREATE TABLE "invite_tokens" (
    "token" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'partner',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_tokens_pkey" PRIMARY KEY ("token")
);

-- AddForeignKey
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "wedding_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
