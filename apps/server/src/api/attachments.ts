import { createHash } from "node:crypto";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { asc, eq } from "drizzle-orm";
import { attachments, emit, enterOrg, inScope } from "@edicthq/db";
import { Attachment, Id, IssueRef } from "@edicthq/schema";
import { callerMember } from "./access.js";
import { body, errors, inOrg, json, OrgParams, router, signedIn, type ApiEnv, type ApiDeps } from "./context.js";
import { invalid, notFound, onApiError, tooLarge } from "./errors.js";
import { visibleIssue } from "./issue-data.js";
import type { AttachmentStorage } from "../storage.js";

type AttachmentRow = typeof attachments.$inferSelect;

export type AttachmentDeps = ApiDeps & { storage: AttachmentStorage; maxAttachmentBytes: number };

// The relative path a description or comment links to (ADR 0020). The file
// name segment is how the file was named at upload; the routing key is the
// attachment's id, which never changes.
export function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    issueId: row.issueId,
    name: row.name,
    path: `/files/${row.id}/${encodeURIComponent(row.name)}`,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    creatorId: row.creatorId,
    createdAt: row.createdAt.toISOString(),
  };
}

const storageKey = (row: AttachmentRow) => `${row.orgId}/${row.id}`;

// The name a link shows: the upload's name as one path segment, cut to
// Postgres's comfortable bound.
function nameOf(raw: string): string {
  const base = raw
    .replace(/[\\/]+/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\.{2,}/g, ".")
    .trim();
  return (base || "file").slice(-255);
}

// Only a sane media type is kept; anything odd serves as octet-stream.
function contentTypeOf(raw: string): string {
  return /^[\w.+-]+\/[\w.+-]+(;.*)?$/.test(raw) ? raw : "application/octet-stream";
}

// Files come back from the app's own origin, so only types a browser shows
// without running anything open inline. HTML, SVG and the rest download.
const inlineTypes = /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm)|audio\/(mpeg|ogg|wav|webm)|text\/plain|application\/pdf)(;|$)/i;

// Room for the multipart boundary and headers around the file itself.
const multipartOverhead = 64 * 1024;

const IssueParams = OrgParams.extend({ issueRef: IssueRef });

const listAttachments = createRoute({
  method: "get",
  path: "/organizations/{orgId}/issues/{issueRef}/attachments",
  tags: ["Attachments"],
  summary: "An issue's attachments",
  description: "Each carries its `path`, which markdown links to (ADR 0020).",
  request: { params: IssueParams },
  responses: { 200: json(z.array(Attachment), "The attachments, oldest first"), ...errors("unauthorized", "not_found") },
});

const createAttachment = createRoute({
  method: "post",
  path: "/organizations/{orgId}/issues/{issueRef}/attachments",
  tags: ["Attachments"],
  summary: "Attach a file to an issue",
  description:
    "A multipart form-data body with one field, `file`. The response's `path` is where the bytes live; point a description or comment at it, like [the drawing](/files/01ARZ3..5/shot.png).",
  request: {
    params: IssueParams,
    body: {
      required: true,
      content: { "multipart/form-data": { schema: z.object({ file: z.file().openapi({ type: "string", format: "binary" }) }) } },
    },
  },
  responses: {
    201: json(Attachment, "The attachment; its `path` is relative to the instance root"),
    ...errors("invalid_request", "unauthorized", "not_found", "too_large"),
  },
});

export function attachmentRoutes(deps: AttachmentDeps) {
  const app = router();

  // Stops an oversized upload while it streams in, before it is buffered.
  app.use(
    "/organizations/:orgId/issues/:issueRef/attachments",
    bodyLimit({
      maxSize: deps.maxAttachmentBytes + multipartOverhead,
      onError: () => {
        throw tooLarge(`The limit is ${deps.maxAttachmentBytes} bytes.`);
      },
    }),
  );

  app.openapi(listAttachments, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    const list = await inOrg(deps, c, orgId, async (tx, caller) => {
      const { issue } = await visibleIssue(tx, caller, issueRef);
      const rows = await tx.select().from(attachments).where(eq(attachments.issueId, issue.id)).orderBy(asc(attachments.id));
      return rows.map(toAttachment);
    });
    return c.json(list, 200);
  });

  app.openapi(createAttachment, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    signedIn(c);
    const form = await c.req.parseBody();
    const file = form["file"];
    if (!(file instanceof File) || file.size === 0) {
      throw invalid("Send the upload under the field `file`.");
    }
    if (file.size > deps.maxAttachmentBytes) {
      throw tooLarge(`The file is ${file.size} bytes; the limit is ${deps.maxAttachmentBytes}.`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const created = await inOrg(deps, c, orgId, async (tx, caller) => {
      const { issue } = await visibleIssue(tx, caller, issueRef);
      const [row] = await tx
        .insert(attachments)
        .values({
          orgId,
          issueId: issue.id,
          name: nameOf(file.name || "file"),
          contentType: contentTypeOf(file.type || ""),
          sizeBytes: file.size,
          checksum,
          creatorId: caller.id,
        })
        .returning();
      await deps.storage.put(storageKey(row!), bytes);
      await emit(tx, orgId, {
        type: "attachment.created",
        actorId: caller.id,
        subjectId: row!.id,
        data: { issueId: issue.id, name: row!.name, sizeBytes: row!.sizeBytes },
      });
      return toAttachment(row!);
    });
    return c.json(created, 201);
  });

  return app;
}

// The /files/{attachmentId}/{file name} paths the attachments point at. These
// sit outside /api/v1: the stored path is forever, so ADR 0020 keeps it out
// of the versioned API. Whoever sees the issue can see its files.
export function fileRoutes(deps: AttachmentDeps): OpenAPIHono<ApiEnv> {
  const app = router();
  app.onError(onApiError);

  app.use(async (c, next) => {
    c.set("user", await deps.getUser(c.req.raw.headers));
    await next();
  });

  app.get("/files/:attachmentId/:fileName", async (c) => {
    const user = signedIn(c);
    const { attachmentId } = c.req.param();
    if (!Id.safeParse(attachmentId).success) {
      throw notFound("file");
    }
    const file = await inScope(deps.db, { userId: user.id, attachmentId }, async (tx) => {
      const [row] = await tx.select().from(attachments).where(eq(attachments.id, attachmentId));
      if (!row) {
        throw notFound("file");
      }
      // Back in the org's scope: membership and issue visibility decide.
      await enterOrg(tx, row.orgId);
      const caller = await callerMember(tx, row.orgId, user.id);
      await visibleIssue(tx, caller, row.issueId);
      const bytes = await deps.storage.get(storageKey(row));
      if (!bytes) {
        throw notFound("file");
      }
      return { row, bytes };
    });
    const name = file.row.name;
    // The typed Data needs its own ArrayBuffer, not a shared one.
    const data = Uint8Array.from(file.bytes);
    const disposition = inlineTypes.test(file.row.contentType) ? "inline" : "attachment";
    return c.body(data, 200, {
      "content-type": file.row.contentType,
      "content-length": String(file.row.sizeBytes),
      "cache-control": "private, max-age=3600",
      "content-disposition": `${disposition}; filename="${name.replace(/["\\\r\n]/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      // Uploaded bytes never run as the instance: no sniffing a type the
      // upload did not claim, and no scripts even if a browser renders it.
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    });
  });

  return app;
}
