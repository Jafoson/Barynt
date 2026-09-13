-- AlterTable
-- Generated columns, not plain ones Prisma would otherwise emit: Postgres
-- recomputes them itself on every INSERT/UPDATE from "title"/"descriptionText"
-- resp. "bodyText", so they can never drift out of sync the way an
-- app-maintained duplicate could. `to_tsvector(regconfig, text)` with a
-- literal config is IMMUTABLE, which is what STORED generated columns
-- require. 'simple' (no stemming/stopwords) instead of 'german': titles and
-- descriptions mix German and English/technical terms, and stemming one
-- language would only mismatch the other.
ALTER TABLE "Comment" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("bodyText", ''))) STORED;

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("descriptionText", '')), 'B')
  ) STORED;

-- CreateIndex
CREATE INDEX "Comment_searchVector_idx" ON "Comment" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Issue_searchVector_idx" ON "Issue" USING GIN ("searchVector");
