import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { scanBytes } from "./malware.js";
import {
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { DB } from "./database.js";
import type { Config } from "./config.js";
import { BusinessClock } from "./clock.js";
import { ensure, requireValue } from "./config.js";
import {
  type Actor,
  AuthService,
  hmac,
  equal,
  token,
  audit,
} from "./security.js";
export function pdfScannerConfigured() {
  return (
    !!process.env.CLAMAV_HOST ||
    (!!process.env.FILE_SCANNER_URL?.startsWith("https://") &&
      (process.env.FILE_SCANNER_TOKEN?.length || 0) >= 32)
  );
}
export class FileService {
  linkSecret: string;
  s3?: S3Client;
  constructor(
    public db: DB,
    public config: Config,
    public auth: AuthService,
  ) {
    this.linkSecret =
      process.env.FILE_LINK_SECRET ||
      (config.paystackSecret
        ? hmac(config.paystackSecret, "fresh-fold-private-file-links")
        : token());
    if (
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
    )
      this.s3 = new S3Client({
        region: process.env.S3_REGION || "auto",
        endpoint: process.env.S3_ENDPOINT,
        ...(process.env.S3_ENDPOINT
          ? ({
              requestChecksumCalculation: "WHEN_REQUIRED",
              responseChecksumValidation: "WHEN_REQUIRED",
            } as const)
          : {}),
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        },
      });
  }
  async store(key: string, bytes: Buffer, mime: string) {
    if (this.s3)
      await this.s3.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: key,
          Body: bytes,
          ContentType: mime,
          ...(!process.env.S3_ENDPOINT
            ? ({ ServerSideEncryption: "AES256" } as const)
            : {}),
        }),
      );
    else {
      ensure(
        this.config.env !== "production" && !process.env.VERCEL,
        503,
        "Private object storage must be configured before uploads.",
      );
      const destination = path.join(this.config.dataRoot, "uploads", key);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes, { mode: 0o600 });
    }
  }
  async bytes(key: string) {
    if (!this.s3)
      return readFile(path.join(this.config.dataRoot, "uploads", key));
    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );
    return Buffer.from(await result.Body!.transformToByteArray());
  }
  async scan(id: string) {
    const file = await this.db.storedFile.findUniqueOrThrow({ where: { id } });
    if (file.status !== "quarantined") return;
    const bytes = await this.bytes(file.key);
    let status: string;
    if (process.env.FILE_SCANNER_URL) {
      ensure(
        process.env.FILE_SCANNER_URL.startsWith("https://") &&
          (process.env.FILE_SCANNER_TOKEN?.length || 0) >= 32,
        503,
        "The private document scanner is not configured.",
      );
      const response = await fetch(process.env.FILE_SCANNER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.FILE_SCANNER_TOKEN}`,
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(20000),
      });
      ensure(response.ok, 503, "Document scanning is temporarily unavailable.");
      const result = (await response.json()) as { status?: string };
      ensure(
        result.status === "clean" || result.status === "infected",
        503,
        "The scanner did not return a valid result.",
      );
      status = result.status;
    } else {
      ensure(
        process.env.CLAMAV_HOST,
        503,
        "Document scanner is unavailable. The file remains quarantined.",
      );
      status = await scanBytes(
        bytes,
        process.env.CLAMAV_HOST,
        Number(process.env.CLAMAV_PORT || 3310),
      );
    }
    await this.db.storedFile.update({ where: { id }, data: { status } });
    await audit(this.db, "document-scanner", `file.${status}`, id);
  }
  async photo(
    actor: Actor,
    input: { base64: string; name: string; kind: "photo" | "coverPhoto" },
  ) {
    this.auth.company(actor, actor.companyId!, "profile.write");
    const original = Buffer.from(input.base64, "base64");
    ensure(
      original.length > 0 && original.length <= 3 * 1024 * 1024,
      400,
      "Choose an image up to 3 MB.",
    );
    let bytes: Buffer;
    try {
      const image = sharp(original, {
        limitInputPixels: 24000000,
        animated: false,
      });
      const meta = await image.metadata();
      ensure(
        ["jpeg", "png", "webp"].includes(meta.format || "") &&
          !!meta.width &&
          meta.width >= 600 &&
          !!meta.height &&
          meta.height >= 400,
        400,
        "Choose a JPEG, PNG, or WebP photograph at least 600 × 400 pixels.",
      );
      bytes = await image
        .rotate()
        .resize({
          width: 1800,
          height: 1400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
    } catch (error) {
      if (error instanceof Error && "status" in error) throw error;
      ensure(
        false,
        400,
        "This photograph could not be opened. Choose another image.",
      );
    }
    const key = `${this.config.env}/photos/${token()}.webp`;
    await this.store(key, bytes, "image/webp");
    const file = await this.db.storedFile.create({
      data: {
        ownerId: actor.id,
        companyId: actor.companyId,
        name: "Business photograph.webp",
        mime: "image/webp",
        size: bytes.length,
        key,
        status: "clean",
      },
    });
    const url = `/api/files/${file.id}/photo`;
    await this.db.company.update({
      where: { id: actor.companyId },
      data: { [input.kind]: url },
    });
    await audit(this.db, actor.id, "company.photo_updated", actor.companyId!);
    return { url };
  }
  async publicPhoto(actor: Actor | null, id: string) {
    const file = requireValue(
      await this.db.storedFile.findUnique({
        where: { id },
        include: { company: true },
      }),
    );
    ensure(
      file.key.includes("/photos/") && file.status === "clean" && file.company,
      404,
      "Photograph not found.",
    );
    const privateAccess =
      actor?.role === "admin" || actor?.companyId === file.companyId;
    const customerAccess =
      !privateAccess && actor
        ? !!(await this.db.order.findFirst({
            where: { userId: actor.id, companyId: file.companyId! },
            select: { id: true },
          }))
        : false;
    const activeHosting = await this.db.subscription.findFirst({
      where: {
        companyId: file.companyId!,
        status: "active",
        endsAt: { gt: await new BusinessClock(this.db, this.config).now() },
        plan: { kind: "hosting" },
      },
    });
    ensure(
      privateAccess ||
        customerAccess ||
        (file.company.status === "approved" &&
          file.company.published &&
          activeHosting),
      404,
      "Photograph not found.",
    );
    return this.bytes(file.key);
  }
  async upload(
    actor: Actor,
    input: { name: string; mime: string; base64: string; companyId?: string },
  ) {
    if (input.companyId)
      this.auth.company(actor, input.companyId, "profile.write");
    let bytes: Buffer = Buffer.from(input.base64, "base64");
    ensure(
      bytes.length > 0 && bytes.length <= 3 * 1024 * 1024,
      400,
      "Upload a file between 1 byte and 3 MB.",
    );
    // Some mobile file managers omit MIME types. Derive the allowed format
    // from its bytes; image decoding and PDF quarantine still apply below.
    const detectedMime =
      bytes.subarray(0, 5).toString() === "%PDF-"
        ? "application/pdf"
        : bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "image/png"
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            ? "image/jpeg"
            : undefined;
    if (detectedMime) input = { ...input, mime: detectedMime };
    if (input.mime === "application/pdf")
      ensure(
        pdfScannerConfigured(),
        503,
        "PDF uploads are unavailable. Please upload a clear PNG or JPEG document.",
      );
    const valid =
      (input.mime === "application/pdf" &&
        bytes.subarray(0, 5).toString() === "%PDF-") ||
      (input.mime === "image/png" &&
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (input.mime === "image/jpeg" &&
        bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255) ||
      (["demo", "test"].includes(this.config.env) &&
        this.config.mode === "simulator" &&
        input.mime === "text/plain" &&
        bytes.toString().includes("DEMONSTRATION"));
    ensure(valid, 400, "Use a valid PDF, PNG, or JPEG.");
    const isDocumentImage =
      input.mime === "image/jpeg" || input.mime === "image/png";
    if (isDocumentImage) {
      try {
        // Store only decoded pixels. Metadata, embedded payloads and original
        // image bytes are discarded; this is distinct from a malware scan.
        bytes = await sharp(bytes, {
          limitInputPixels: 24000000,
          animated: false,
        })
          .rotate()
          .resize({
            width: 2400,
            height: 2400,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 90 })
          .toBuffer();
        input = {
          ...input,
          mime: "image/jpeg",
          name: input.name.replace(/\.[^.]+$/, "") + ".jpg",
        };
      } catch {
        ensure(
          false,
          400,
          "This document image could not be processed. Choose another photograph.",
        );
      }
    }
    const name =
      path
        .basename(input.name)
        .replace(/[^\w .-]/g, "")
        .slice(0, 100) || "verification-document";
    const key = `${this.config.env}/quarantine/${token()}`;
    if (this.s3)
      await this.s3.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: key,
          Body: bytes,
          ContentType: input.mime,
          ServerSideEncryption: "AES256",
        }),
      );
    else {
      ensure(
        this.config.env !== "production" && !process.env.VERCEL,
        503,
        "Private object storage must be configured before production document uploads.",
      );
      const file = path.join(this.config.dataRoot, "uploads", key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
    }
    const status = isDocumentImage
      ? "sanitized"
      : ["demo", "test"].includes(this.config.env) &&
          this.config.mode === "simulator" &&
          input.mime === "text/plain"
        ? "demo_sample"
        : "quarantined";
    const record = await this.db.storedFile.create({
      data: {
        ownerId: actor.id,
        companyId: input.companyId,
        name,
        mime: input.mime,
        size: bytes.length,
        key,
        status,
      },
    });
    await audit(
      this.db,
      actor.id,
      "file.uploaded",
      record.id,
      status === "demo_sample"
        ? "Demonstration sample; not valid verification material."
        : isDocumentImage
          ? "Document image decoded and re-encoded without original metadata or embedded content."
          : "Quarantined pending malware scan.",
    );
    if (status === "quarantined")
      await this.db.job.create({
        data: {
          key: `scan-${record.id}`,
          kind: "file_scan",
          payload: { fileId: record.id },
          dueAt: new Date(),
        },
      });
    return { id: record.id, name, status };
  }
  async permitted(actor: Actor, id: string) {
    const f = requireValue(
      await this.db.storedFile.findUnique({ where: { id } }),
    );
    ensure(
      actor.id === f.ownerId ||
        actor.role === "admin" ||
        (actor.companyId === f.companyId &&
          actor.permissions.includes("files.read")),
      403,
      "This document is private.",
    );
    return f;
  }
  async link(actor: Actor, id: string) {
    const f = await this.permitted(actor, id);
    ensure(
      actor.role !== "admin" || f.status !== "quarantined",
      409,
      "This PDF is waiting for its security scan. Scan it before opening the document.",
    );
    ensure(
      f.status !== "infected",
      409,
      "This document was rejected by the security scan.",
    );
    const expires = Date.now() + 5 * 60000;
    return {
      url: `/api/files/${id}/download?expires=${expires}&signature=${hmac(this.linkSecret, `${actor.id}:${f.id}:${expires}`)}`,
      expires,
    };
  }
  async download(actor: Actor, id: string, expires: string, signature: string) {
    const f = await this.permitted(actor, id);
    ensure(
      actor.role !== "admin" || f.status !== "quarantined",
      409,
      "This PDF is waiting for its security scan. Scan it before opening the document.",
    );
    ensure(
      f.status !== "infected",
      409,
      "This document was rejected by the security scan.",
    );
    ensure(
      Number(expires) > Date.now() &&
        Number(expires) <= Date.now() + 5 * 60000 &&
        equal(signature, hmac(this.linkSecret, `${actor.id}:${id}:${expires}`)),
      403,
      "This download link has expired.",
    );
    await audit(this.db, actor.id, "file.downloaded", id);
    if (this.s3) {
      const result = await this.s3.send(
        new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: f.key }),
      );
      return {
        file: f,
        bytes: Buffer.from(await result.Body!.transformToByteArray()),
      };
    }
    return {
      file: f,
      bytes: await readFile(path.join(this.config.dataRoot, "uploads", f.key)),
    };
  }
  async cleanDownloadUrl(actor: Actor, id: string) {
    const f = await this.permitted(actor, id);
    ensure(
      f.status === "clean" && this.s3,
      409,
      "Only malware-scanned files can receive an object-storage download URL.",
    );
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: f.key,
        ResponseContentDisposition: `attachment; filename="${f.name}"`,
      }),
      { expiresIn: 300 },
    );
  }
}
