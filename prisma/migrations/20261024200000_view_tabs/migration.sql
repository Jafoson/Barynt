-- Tab-Leiste pro Person (BARY-184): Reihenfolge und ausgeblendete Views.
ALTER TABLE "SavedViewUserState" ADD COLUMN "tabPosition" DOUBLE PRECISION;
ALTER TABLE "SavedViewUserState" ADD COLUMN "tabHidden" BOOLEAN NOT NULL DEFAULT false;
