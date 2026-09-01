import "server-only"

import { randomUUID } from "node:crypto"
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const BUCKET = process.env.S3_BUCKET ?? "grievance"

/**
 * Object storage for complaint photos.
 *
 * MinIO in development, any S3-compatible bucket in production - the only
 * difference is the endpoint, so moving to R2 or S3 is configuration rather
 * than code. `forcePathStyle` is what MinIO needs: it serves buckets as a path
 * segment rather than a subdomain.
 */
const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
})

export function isStorageConfigured() {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY,
  )
}

/** Photos only, and only formats a browser will actually render. */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export const MAX_IMAGES_PER_COMPLAINT = 5

export function isAllowedImageType(contentType: string) {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(contentType)
}

/**
 * Mint a presigned PUT so the browser uploads straight to MinIO.
 *
 * The bytes never pass through Next, which keeps a 10MB photo off the server's
 * request path entirely. The key is generated here rather than accepted from
 * the client - otherwise a caller could name a key inside another user's
 * prefix and overwrite their evidence.
 */
export async function presignUpload({
  contentType,
  fileName,
  userId,
}: {
  contentType: string
  fileName: string
  userId: string
}) {
  const key = `complaints/${userId}/${randomUUID()}/${sanitizeFileName(fileName)}`

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 60 * 5 },
  )

  return { url, key }
}

/**
 * Confirm an uploaded object exists and is what it claimed to be.
 *
 * The presigned PUT happens out of band, so without this a client could submit
 * a key it never uploaded, or upload something far larger than it declared.
 */
export async function verifyUpload(key: string) {
  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: key }),
    )

    const size = head.ContentLength ?? 0
    const contentType = head.ContentType ?? ""

    if (size <= 0 || size > MAX_IMAGE_BYTES) return null
    if (!isAllowedImageType(contentType)) return null

    return { size, contentType }
  } catch {
    return null
  }
}

/**
 * Read one uploaded object back into memory.
 *
 * Used by image verification, which has to show the model the actual bytes.
 * Capped at the same ceiling the upload is: an object that somehow exceeds it
 * is rejected rather than pulled into the server's heap.
 */
export async function getObjectBytes(key: string) {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  )

  const size = response.ContentLength ?? 0

  if (size <= 0 || size > MAX_IMAGE_BYTES) return null

  const contentType = response.ContentType ?? ""

  if (!isAllowedImageType(contentType)) return null

  const bytes = await response.Body?.transformToByteArray()

  if (!bytes) return null

  return { bytes, contentType }
}

/**
 * A time-limited URL for viewing one photo.
 *
 * Minted per request rather than stored, so a link that leaks out of a page
 * stops working - the database keeps the key, never a live URL.
 */
export function signedViewUrl(key: string) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: 60 * 15,
  })
}

/** Strip anything that would let a name escape its prefix or confuse a header. */
function sanitizeFileName(name: string) {
  const cleaned = name
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-80)

  return cleaned || "photo"
}
