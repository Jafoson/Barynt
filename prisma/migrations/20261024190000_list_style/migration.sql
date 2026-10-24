-- Liste als Tabelle (BARY-175): moderner oder klassischer Stil.
ALTER TABLE "UserPreferences" ADD COLUMN "listStyle" TEXT NOT NULL DEFAULT 'modern';
