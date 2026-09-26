-- A custom field can be given an icon (BARY-81), one of a fixed list (`lib/custom-fields/icons.ts`); no
-- icon means the icon of its type.
-- AlterTable
ALTER TABLE "CustomFieldDefinition" ADD COLUMN     "icon" TEXT;
