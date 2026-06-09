import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { ensureDir, resolveVaultPaths, sha256, shortId, slugify, titleFromPath } from "./paths.js";
import { NotvaState } from "./state.js";
import type { PageRecord, ProposalRecord, SourceRecord } from "./types.js";

export interface IngestSourceOptions {
  root: string;
  target: string;
  kind?: "file" | "url" | "text" | "directory";
}

export interface IngestSourceResult {
  source: SourceRecord;
  proposal: ProposalRecord;
}

export interface IngestDirectoryResult {
  results: IngestSourceResult[];
  skipped: Array<{ path: string; reason: "unsupported_extension" | "not_file" }>;
}

const SUPPORTED_DIRECTORY_EXTENSIONS = new Set([
  ".md", ".markdown", ".txt", ".text", ".html", ".htm",
  ".json", ".jsonl", ".log", ".csv", ".tsv", ".yaml", ".yml", ".toml", ".ini", ".env",
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".py", ".rb", ".php", ".go", ".rs", ".java", ".kt", ".swift", ".cs",
  ".c", ".cc", ".cpp", ".h", ".hpp",
  ".sh", ".bash", ".zsh", ".fish", ".sql",
  ".css", ".scss", ".sass", ".less", ".xml"
]);
const SKIPPED_DIRECTORY_NAMES = new Set([".git", ".notva", "node_modules"]);

export async function ingestSource(options: IngestSourceOptions): Promise<IngestSourceResult> {
  const paths = resolveVaultPaths(options.root);
  const now = new Date().toISOString();
  const parsed = await readTarget(options);
  const rawContent = parsed.rawContent ?? parsed.content;
  const id = shortId(`${parsed.kind}:${parsed.originalRef}:${rawContent}`);
  const pageTitle = extractTitle(parsed.content, parsed.title);
  const pagePath = `${slugify(pageTitle)}.md`;
  const proposalId = shortId(`proposal:${id}:${pagePath}`);

  const state = new NotvaState(paths.stateDb);
  let relatedPages: PageRecord[] = [];
  try {
    state.initialize();
    relatedPages = state.listPages();
    const existingProposal = state.getProposal(proposalId);
    const existingSource = state.getSource(id);
    if (existingProposal && existingSource) {
      return { source: existingSource, proposal: existingProposal };
    }
  } finally {
    state.close();
  }

  const datedRawDir = join(paths.raw, now.slice(0, 10));
  await mkdir(datedRawDir, { recursive: true });
  const rawFileName = `${slugify(parsed.title)}-${id}${parsed.extension}`;
  const rawPath = join(datedRawDir, rawFileName);
  await writeFile(rawPath, rawContent, "utf8");

  const source: SourceRecord = {
    id,
    kind: parsed.kind,
    title: parsed.title,
    rawPath,
    originalRef: parsed.originalRef,
    createdAt: now,
    sha256: sha256(rawContent)
  };

  const proposal = buildProposalFromSourceContent({ source, content: parsed.content, createdAt: now, relatedPages });

  await ensureDir(paths.queue);
  const insertState = new NotvaState(paths.stateDb);
  try {
    insertState.initialize();
    insertState.insertSource(source);
    insertState.insertProposal(proposal);
  } finally {
    insertState.close();
  }

  return { source, proposal };
}

export function contentForSourceProposal(
  source: Pick<SourceRecord, "kind" | "title"> & Partial<Pick<SourceRecord, "rawPath" | "originalRef">>,
  rawContent: string
): string {
  if (source.kind === "url") return htmlToReadableText(rawContent, source.title);
  const path = source.rawPath ?? source.originalRef ?? "";
  return contentForFileProposal(path, source.title, rawContent);
}

export function buildProposalFromSourceContent(input: {
  source: SourceRecord;
  content: string;
  createdAt: string;
  proposalIdSalt?: string;
  relatedPages?: PageRecord[];
}): ProposalRecord {
  const pageTitle = extractTitle(input.content, input.source.title);
  const pagePath = `${slugify(pageTitle)}.md`;
  const proposalIdSeed = input.proposalIdSalt
    ? `proposal:${input.source.id}:${pagePath}:${input.proposalIdSalt}`
    : `proposal:${input.source.id}:${pagePath}`;
  const content = renderWikiPage({
    title: pageTitle,
    path: pagePath,
    source: input.source,
    body: input.content,
    createdAt: input.createdAt,
    relatedPages: input.relatedPages ?? []
  });

  return {
    id: shortId(proposalIdSeed),
    sourceId: input.source.id,
    status: "pending",
    summary: `Create wiki page "${pageTitle}" from source "${input.source.title}".`,
    changes: [{ type: "create_page", path: pagePath, title: pageTitle, content }],
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  };
}

export async function ingestDirectory(options: IngestSourceOptions): Promise<IngestDirectoryResult> {
  const entries = await listDirectoryTargets(options.target);
  const results: IngestSourceResult[] = [];
  for (const file of entries.files) {
    results.push(await ingestSource({ root: options.root, target: file, kind: "file" }));
  }
  return {
    results,
    skipped: entries.skipped
  };
}

async function readTarget(options: IngestSourceOptions): Promise<{
  kind: "file" | "url" | "text";
  title: string;
  content: string;
  originalRef: string;
  extension: string;
  rawContent?: string;
}> {
  if (options.kind === "directory") {
    throw new Error("Use ingestDirectory for directory targets.");
  }

  if (options.kind === "text") {
    return {
      kind: "text",
      title: firstTextTitle(options.target),
      content: options.target,
      originalRef: "inline:text",
      extension: ".md"
    };
  }

  if (options.kind === "url" || /^https?:\/\//.test(options.target)) {
    const response = await fetch(options.target);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${options.target}: ${response.status} ${response.statusText}`);
    }
    const rawContent = await response.text();
    const title = extractHtmlTitle(rawContent) ?? new URL(options.target).hostname;
    const content = htmlToReadableText(rawContent, title);
    return {
      kind: "url",
      title,
      content,
      originalRef: options.target,
      extension: ".html",
      rawContent
    };
  }

  const rawContent = await readFile(options.target, "utf8");
  return {
    kind: "file",
    title: titleFromPath(options.target),
    content: contentForFileProposal(options.target, titleFromPath(options.target), rawContent),
    originalRef: options.target,
    extension: extname(options.target) || ".txt",
    rawContent
  };
}

async function listDirectoryTargets(root: string): Promise<{
  files: string[];
  skipped: Array<{ path: string; reason: "unsupported_extension" | "not_file" }>;
}> {
  const files: string[] = [];
  const skipped: Array<{ path: string; reason: "unsupported_extension" | "not_file" }> = [];

  async function visit(path: string): Promise<void> {
    const info = await stat(path);
    if (info.isDirectory()) {
      if (SKIPPED_DIRECTORY_NAMES.has(basename(path))) return;
      const children = await readdir(path);
      for (const child of children.sort((a, b) => a.localeCompare(b))) {
        if (child.startsWith(".")) continue;
        await visit(join(path, child));
      }
      return;
    }
    if (!info.isFile()) {
      skipped.push({ path, reason: "not_file" });
      return;
    }
    const extension = extname(path).toLocaleLowerCase();
    if (!SUPPORTED_DIRECTORY_EXTENSIONS.has(extension)) {
      skipped.push({ path, reason: "unsupported_extension" });
      return;
    }
    files.push(path);
  }

  await visit(root);
  files.sort((a, b) => a.localeCompare(b));
  skipped.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skipped };
}

function extractTitle(content: string, fallback: string): string {
  const heading = content.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  if (heading) return heading.replace(/^#\s+/, "").trim();
  return fallback || "Untitled";
}

function firstTextTitle(text: string): string {
  return extractTitle(text, text.split(/\s+/).slice(0, 6).join(" ") || "inline note");
}

function extractHtmlTitle(html: string): string | undefined {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?? html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const clean = title ? normalizeExtractedText(stripHtmlTags(title)) : "";
  return clean || undefined;
}

function htmlToReadableText(html: string, title: string): string {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const withoutHidden = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  const withBreaks = withoutHidden
    .replace(/<\/(h[1-6]|p|li|blockquote|pre|tr|div|section|article|header|footer|main)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ");
  const text = normalizeExtractedText(stripHtmlTags(withBreaks));
  return text.startsWith(title) ? `# ${text}` : `# ${title}\n\n${text}`.trim();
}

function contentForFileProposal(path: string, title: string, rawContent: string): string {
  const extension = extname(path).toLocaleLowerCase();
  if (extension === ".html" || extension === ".htm") {
    return htmlToReadableText(rawContent, title);
  }
  if (extension === ".json" || extension === ".jsonl") {
    try {
      return chatLogToMarkdown(rawContent, title, extension) ?? rawContent;
    } catch {
      return rawContent;
    }
  }
  return rawContent;
}

function chatLogToMarkdown(rawContent: string, title: string, extension: string): string | undefined {
  const messages = extension === ".jsonl"
    ? parseJsonLines(rawContent).flatMap(extractChatMessages)
    : extractChatMessages(JSON.parse(rawContent) as unknown);
  if (messages.length === 0) return undefined;
  return [
    `# ${title}`,
    "",
    "## Conversation",
    "",
    messages.map((message) => `**${message.role}:** ${message.content}`).join("\n\n")
  ].join("\n");
}

function parseJsonLines(rawContent: string): unknown[] {
  return rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

function extractChatMessages(value: unknown): Array<{ role: string; content: string }> {
  if (Array.isArray(value)) return value.flatMap(messageFromUnknown);
  if (!isRecord(value)) return [];

  const directArrays = ["messages", "conversation", "items"]
    .map((key) => value[key])
    .filter(Array.isArray) as unknown[][];
  const directMessages = directArrays.flatMap((items) => items.flatMap(messageFromUnknown));
  if (directMessages.length > 0) return directMessages;

  if (isRecord(value.mapping)) {
    return Object.values(value.mapping)
      .map((entry) => isRecord(entry) ? entry.message : undefined)
      .flatMap(messageFromUnknown);
  }

  return messageFromUnknown(value);
}

function messageFromUnknown(value: unknown): Array<{ role: string; content: string }> {
  if (!isRecord(value)) return [];
  const role = textValue(value.role)
    ?? textValue(value.sender)
    ?? textValue(value.from)
    ?? (isRecord(value.author) ? textValue(value.author.role) : undefined)
    ?? "message";
  const content = chatContentText(value.content) ?? chatContentText(value.text);
  return content ? [{ role, content }] : [];
}

function chatContentText(value: unknown): string | undefined {
  if (typeof value === "string") return normalizeInlineText(value);
  if (Array.isArray(value)) {
    const text = value.map(chatContentText).filter(Boolean).join("\n");
    return text ? normalizeInlineText(text) : undefined;
  }
  if (!isRecord(value)) return undefined;
  if (Array.isArray(value.parts)) {
    const text = value.parts.map(chatContentText).filter(Boolean).join("\n");
    return text ? normalizeInlineText(text) : undefined;
  }
  return textValue(value.text) ?? textValue(value.value);
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? normalizeInlineText(value) : undefined;
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stripHtmlTags(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, " "));
}

function normalizeExtractedText(input: string): string {
  return input
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function renderWikiPage(input: {
  title: string;
  path: string;
  source: SourceRecord;
  body: string;
  createdAt: string;
  relatedPages: PageRecord[];
}): string {
  const excerpt = input.body.replace(/\s+/g, " ").trim().slice(0, 600);
  const related = findMentionedPages({
    body: input.body,
    currentPath: input.path,
    currentTitle: input.title,
    pages: input.relatedPages
  });
  const relatedSection = related.length > 0
    ? `\n## Related Wiki Pages\n\n${related.map((page) => `- [[${page.title}]] (${page.path})`).join("\n")}\n`
    : "";
  return `---
title: "${input.title.replaceAll('"', '\\"')}"
sources:
  - ${input.source.id}
created: ${input.createdAt}
---

# ${input.title}

## Summary

${excerpt || "No textual content extracted."}
${relatedSection}

## Sources

- ${input.source.id}: ${basename(input.source.rawPath)}
`;
}

function findMentionedPages(input: {
  body: string;
  currentPath: string;
  currentTitle: string;
  pages: PageRecord[];
}): PageRecord[] {
  const haystack = normalizeForMention(input.body);
  return input.pages
    .filter((page) => page.path !== input.currentPath && page.title.toLocaleLowerCase() !== input.currentTitle.toLocaleLowerCase())
    .filter((page) => haystack.includes(normalizeForMention(page.title)))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function normalizeForMention(input: string): string {
  return input.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}
