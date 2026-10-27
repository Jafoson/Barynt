import "server-only";

export type {
  FinalizeAttachmentUploadResult,
  RequestAttachmentUploadResult,
  StoreAttachmentResult,
} from "@/lib/storage/attachments";
export {
  deleteAttachmentObject,
  finalizeAttachmentUpload,
  readAttachmentBytes,
  requestAttachmentUpload,
  resolveAttachmentUrl,
  storeAttachmentBytes,
} from "@/lib/storage/attachments";
export type {
  AvatarKind,
  RequestAvatarUploadResult,
} from "@/lib/storage/avatars";
export {
  deleteAvatarObject,
  finalizeAvatarUpload,
  requestAvatarUpload,
  resolveAvatarUrl,
} from "@/lib/storage/avatars";
export type { StorageConfig } from "@/lib/storage/config";
export {
  isAttachmentsConfigured,
  isStorageConfigured,
  storageConfig,
} from "@/lib/storage/config";
export {
  deleteObjectSafely,
  GET_EXPIRES_IN,
  getObjectBytes,
  objectExists,
  PUT_EXPIRES_IN,
  presignGetUrl,
  presignPutUrl,
  putObject,
} from "@/lib/storage/presign";
