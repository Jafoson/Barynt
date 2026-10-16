-- CreateTable
CREATE TABLE "DashboardNote" (
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "widgetId" TEXT NOT NULL,
    "pages" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardNote_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "DashboardNote_userId_target_idx" ON "DashboardNote"("userId", "target");

-- AddForeignKey
ALTER TABLE "DashboardNote" ADD CONSTRAINT "DashboardNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


