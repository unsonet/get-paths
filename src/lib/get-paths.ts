import * as fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';

import * as path from 'node:path';
import { createIgnoreMatcher, IgnoreMatcher } from '@unsonet/ignore-patterns';
import { objectFilter } from '@unsonet/js-utils';
// import { createRequire } from 'node:module';
// const nodeRequire = createRequire(process.cwd() + '/');

export type GetPathsFormat = 'flat' | 'tree';

export interface GetPathsOptions {
  input: string;
  format?: GetPathsFormat;
  fields?: PathItemField[];
  ignore?: string | null;
  cwd?: string;
  processor?: string | GetPathsProcessor;
}

export interface GetPathsProcessorContext {
  type: 'file' | 'directory';
  fullPath: string;
  relativePath: string;
  rootDir: string;
  entry: Dirent;
  stats: PathItem;
}

export interface GetPathsProcessor {
  onItem?(context: GetPathsProcessorContext): Promise<unknown> | unknown;
  onFile?(context: GetPathsProcessorContext): Promise<unknown> | unknown;
  onDirectory?(context: GetPathsProcessorContext): Promise<unknown> | unknown;
  finalize?(items: unknown[]): Promise<unknown> | unknown;
}

export interface PathItem {
  type: 'file' | 'directory';
  size: number;
  createdAt: string;
  modifiedAt: string;
  path?: string;
}

export type PathItemField = keyof PathItem;

export interface FlatResult {
  input: string;
  generatedAt: string;
  items: PathItem[];
}

export type TreeResult = Record<string, unknown>;

interface NormalizedOptions {
  input: string;
  format: GetPathsFormat;
  fields: PathItemField[];
  ignore: string | null | undefined;
  cwd: string;
  processor?: string | GetPathsProcessor;
}

export class GetPaths {
  private readonly options: NormalizedOptions;

  constructor(options: GetPathsOptions) {
    if (!options?.input) {
      throw new Error('You need to specify input');
    }

    this.options = {
      input: path.resolve(options.input),
      format: options.format ?? 'flat',
      fields: Array.isArray(options.fields)
        ? options.fields
          .map((field) => String(field).trim())
          .filter(Boolean) as PathItemField[]
        : [],
      ignore: options.ignore,
      cwd: path.resolve(options.cwd ?? process.cwd()),
      processor: options.processor,
    };
  }

  async run(): Promise<FlatResult | TreeResult | unknown> {
    const inputStat = await fs.stat(this.options.input);

    const ignoreMatcher = await createIgnoreMatcher({
      ignore: this.options.ignore,
      cwd: this.options.cwd,
    });

    const processor = await loadProcessor(
      this.options.processor,
      this.options.cwd,
    );

    if (inputStat.isFile()) {
      const fullPath = this.options.input;

      const stats = await this.getStats(
        fullPath,
        path.dirname(fullPath),
        {
          isDirectory: () => false,
        } as any,
      );

      const context: GetPathsProcessorContext = {
        type: 'file',
        fullPath,
        relativePath: path.basename(fullPath),
        rootDir: path.dirname(fullPath),
        entry: {
          isDirectory: () => false,
          name: path.basename(fullPath),
        } as any,
        stats,
      };

      const result = processor
        ? await this.processItem(context, processor)
        : stats;

      return processor?.finalize
        ? processor.finalize([result])
        : [result];
    }

    // PROCESSOR MODE
    if (processor) {
      const items = await this.walkWithProcessor(
        this.options.input,
        this.options.input,
        ignoreMatcher,
        processor,
      );

      if (processor.finalize) {
        return processor.finalize(items);
      }

      return items;
    }

    // TREE MODE
    if (this.options.format === 'tree') {
      return this.walkTree(
        this.options.input,
        this.options.input,
        ignoreMatcher,
      );
    }

    // FLAT MODE
    const items = await this.walk(
      this.options.input,
      this.options.input,
      ignoreMatcher,
    );

    return {
      input: this.options.input,
      generatedAt: new Date().toISOString(),
      items,
    };
  }

  async runFlat(): Promise<FlatResult> {
    const result = await this.run();
    if (Array.isArray((result as FlatResult).items)) {
      return result as FlatResult;
    }
    throw new Error('runFlat() called but format is tree');
  }

  async runTree(): Promise<TreeResult> {
    const prev = this.options.format;

    try {
      (this.options as NormalizedOptions).format = 'tree';

      const result = await this.run();

      if (
        result &&
        typeof result === 'object' &&
        !Array.isArray(result) &&
        !('items' in result)
      ) {
        return result as TreeResult;
      }

      throw new Error('Expected tree result');
    } finally {
      (this.options as NormalizedOptions).format = prev;
    }
  }


  private async getStats(fullPath: string, rootDir: string, entry: Dirent): Promise<PathItem> {
    const stat = await fs.stat(fullPath);

    const item: PathItem = {
      type: entry.isDirectory() ? 'directory' : 'file',
      size: stat.size,
      createdAt: stat.birthtime.toISOString(),
      modifiedAt: stat.mtime.toISOString(),
    };

    const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    item.path = relativePath;

    return item;
  }

  private async walk(dir: string, rootDir: string, ignoreMatcher: IgnoreMatcher): Promise<PathItem[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    const result: PathItem[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (ignoreMatcher.test(fullPath, entry.isDirectory())) {
        continue;
      }

      const stats = await this.getStats(fullPath, rootDir, entry);

      let item = objectFilter(stats, (key, value) => {
        return this.options.fields.includes(key) || key == 'path';
      });

      result.push(item);

      if (entry.isDirectory()) {
        const nested = await this.walk(fullPath, rootDir, ignoreMatcher);
        result.push(...nested);
      }
    }

    return result;
  }

  private async walkTree(
    dir: string,
    rootDir: string,
    ignoreMatcher: IgnoreMatcher,
  ): Promise<TreeResult> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    const result: TreeResult = {};

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (ignoreMatcher.test(fullPath, entry.isDirectory())) {
        continue;
      }

      if (entry.isDirectory()) {
        result[entry.name] = await this.walkTree(fullPath, rootDir, ignoreMatcher);
        continue;
      }

      if (this.options.fields.length) {
        const stats = await this.getStats(fullPath, rootDir, entry);

        let item = this.options.fields.reduce<Array<string | number | null>>((prev, field) => {
          const value = stats[field];
          prev.push(value !== undefined ? (value as string | number) : null);
          return prev;
        }, []);

        if (item.length === 1) {
          result[entry.name] = item[0] ?? null;
        } else {
          result[entry.name] = item.length ? item : null;
        }
      } else {
        result[entry.name] = null;
      }
    }

    return result;
  }

  private async walkWithProcessor(
    dir: string,
    rootDir: string,
    ignoreMatcher: IgnoreMatcher,
    processor: GetPathsProcessor,
  ): Promise<unknown[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    const result: unknown[] = [];

    for (const entry of entries) {
      if (!entry) return [];
      const fullPath = path.join(dir, entry.name);

      if (ignoreMatcher.test(fullPath, entry.isDirectory())) {
        continue;
      }

      const stats = await this.getStats(fullPath, rootDir, entry);

      const context: GetPathsProcessorContext = {
        type: entry.isDirectory() ? 'directory' : 'file',
        fullPath,
        relativePath: path.relative(rootDir, fullPath).replace(/\\/g, '/'),
        rootDir,
        entry,
        stats,
      };

      const processed = await this.processItem(context, processor);

      result.push(processed);

      if (entry.isDirectory()) {
        const nested = await this.walkWithProcessor(
          fullPath,
          rootDir,
          ignoreMatcher,
          processor,
        );

        result.push(...nested);
      }
    }

    return result;
  }

  private async processItem(
    context: GetPathsProcessorContext,
    processor?: GetPathsProcessor,
  ): Promise<unknown> {
    if (!processor) {
      return context.stats;
    }

    let handled = false;
    let result: unknown;

    if (processor.onItem) {
      handled = true;
      result = await processor.onItem(context);
    }

    if (context.type === 'file' && processor.onFile) {
      handled = true;
      result = await processor.onFile(context);
    }

    if (context.type === 'directory' && processor.onDirectory) {
      handled = true;
      result = await processor.onDirectory(context);
    }

    if (!handled) {
      return undefined;
    }

    return result;
  }
}

export async function getPaths(options: GetPathsOptions): Promise<FlatResult | TreeResult> {
  return new GetPaths(options).run() as any;
}

async function loadProcessor(processor, cwd) {
  if (!processor) return undefined;

  if (typeof processor !== 'string') {
    return processor;
  }

  const raw = processor.trim();

  const candidates = [
    raw,
    path.isAbsolute(raw) ? raw : path.resolve(cwd, raw),
  ];

  for (const p of candidates) {
    try {
      //console.log('[processor] stat check:', p);
      const stat = await fs.stat(p);
      //console.log('[processor] EXISTS:', p, 'isFile=', stat.isFile());
      if (!stat.isFile()) continue;
      //console.log('[processor] loading via require:', p);
      const mod = require(p);
      const loaded = mod.default ?? mod;
      //console.log('[processor] loaded OK:', p);
      return typeof loaded === 'function'
        ? loaded()
        : loaded;
    } catch (e) {
      //console.log('[processor] FAILED:', p);
      //console.log(e);
    }
  }

  throw new Error(
    `Invalid processor. Tried:\n` + candidates.join('\n')
  );
}