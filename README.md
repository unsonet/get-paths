# @unsonet/get-paths

Node.js utility for generating file system maps with support for **flat**, **tree**, and **custom processor pipelines**.

Works as:

* npm library
* CLI tool
* Nx monorepo package
* TypeScript-first API
* extensible filesystem traversal engine

---

# Features

* Recursive directory traversal
* Output formats:

  * `flat`
  * `tree`
  * **custom processor output**
* `.gitignore`-style ignore rules
* automatic `.gitignore` discovery (upwards from cwd)
* inline ignore rules
* optional ignore system disabling
* file metadata:

  * type
  * size
  * createdAt
  * modifiedAt
  * relative path
* **processor API (plugin system)**
* TypeScript support
* no runtime dependencies outside Node.js

---

# Installation

```bash
npm install @unsonet/get-paths
```

---

# Usage

## Library API

### Basic Example

```ts
import { getPaths } from '@unsonet/get-paths';

const result = await getPaths({
  input: './src',
});

console.log(result);
```

---

## Class API

```ts
import { GetPaths } from '@unsonet/get-paths';

const scanner = new GetPaths({
  input: './src',
  format: 'tree',
});

const result = await scanner.run();

console.log(result);
```

---

# Output Formats

## Flat format

```ts
const result = await getPaths({
  input: './src',
  format: 'flat',
});
```

```json
{
  "input": "/project/src",
  "generatedAt": "2026-06-12T12:00:00.000Z",
  "items": [
    {
      "type": "file",
      "size": 120,
      "createdAt": "2026-06-01T10:00:00.000Z",
      "modifiedAt": "2026-06-10T08:00:00.000Z",
      "path": "index.ts"
    }
  ]
}
```

---

## Tree format

```ts
const result = await getPaths({
  input: './src',
  format: 'tree',
});
```

```json
{
  "lib": {
    "index.ts": null,
    "utils.ts": null
  }
}
```

---

# Fields

You can reduce payload size by selecting fields.

Available fields:

* `type`
* `size`
* `createdAt`
* `modifiedAt`
* `path`

```ts
const result = await getPaths({
  input: './src',
  format: 'tree',
  fields: ['size', 'modifiedAt'],
});
```

```json
{
  "index.ts": [120, "2026-06-10T08:00:00.000Z"]
}
```

Single field unwraps automatically:

```ts
fields: ['size']
```

```json
{
  "index.ts": 120
}
```

---

# Ignore Rules

## Automatic `.gitignore`

The library automatically resolves `.gitignore` files:

* from current working directory
* upwards through parent directories

---

## Disable ignore system

```ts
const result = await getPaths({
  input: './src',
  ignore: null,
});
```

---

## Inline ignore rules

```ts
const result = await getPaths({
  input: './src',
  ignore: `
node_modules/
dist/
.vscode/*
*.log
`,
});
```

---

## Custom ignore file

```ts
const result = await getPaths({
  input: './src',
  ignore: './custom.ignore',
});
```

---

# Supported ignore patterns

```gitignore
node_modules/
dist/
.vscode/*
*.log
coverage/**
!important.log
```

Supported:

* `*`
* `**`
* `?`
* negation (`!`)
* directory rules
* anchored paths

---

# 🔌 Processor API

You can fully customize traversal output using a **processor plugin**.

## Processor interface

```ts
export interface GetPathsProcessor {
  onItem?(context): unknown;
  onFile?(context): unknown;
  onDirectory?(context): unknown;
  finalize?(items: unknown[]): unknown;
}
```

---

## Processor context

```ts
export interface GetPathsProcessorContext {
  type: 'file' | 'directory';
  fullPath: string;
  relativePath: string;
  rootDir: string;
  stats: PathItem;
  entry: Dirent;
}
```

---

## Processor behavior

Priority order:

1. `onFile`
2. `onDirectory`
3. `onItem`
4. fallback → `stats`

---

## Example: custom text dump processor

```ts
export default {
  async onFile(ctx) {
    return `[${ctx.relativePath}]:\nfile`;
  },

  async onDirectory(ctx) {
    return `[${ctx.relativePath}]:\ndirectory`;
  },
};
```

---

## Example: full file content dump

```ts
import { readFileSync } from 'node:fs';

export default {
  async onFile(ctx) {
    const content = readFileSync(ctx.fullPath, 'utf8');

    return `[${ctx.relativePath}]:\n${content}`;
  },

  finalize(items) {
    return items.join('\n\n');
  },
};
```

---

## Using processor via file path

```ts
const result = await getPaths({
  input: './src',
  processor: './processors/text-dump.processor.js',
});
```

---

# CLI Usage

```bash
npx get-paths --input "./src"
```

---

## Save output

```bash
get-paths --input "./src" --save --output "./paths.json"
```

---

## Tree mode

```bash
get-paths --input "./src" --format tree
```

---

## Fields

```bash
get-paths --input "./src" --format tree --fields size,modifiedAt
```

---

## Disable ignore

```bash
get-paths --input "./src" --ignore null
```

---

## Inline ignore

```bash
get-paths --input "./src" --ignore "dist/\nnode_modules/"
```

---

## Processor (CLI)

```bash
get-paths \
  --input "./src" \
  --processor "./processors/text-dump.processor.js"
```

---

# API

## getPaths(options)

```ts
type GetPathsOptions = {
  input: string;
  format?: 'flat' | 'tree';
  fields?: PathItemField[];
  ignore?: string | null;
  cwd?: string;

  // NEW
  processor?: string | GetPathsProcessor;
};
```

---

# Types

```ts
type PathItemField =
  | 'type'
  | 'size'
  | 'createdAt'
  | 'modifiedAt'
  | 'path';
```

---

# License

MIT

