import { readFileSync } from 'node:fs';
import { minifyText } from '@unsonet/minify-text';

export interface TextDumpProcessorOptions {
  maxFileSize?: number;
}

export default function createTextDumpProcessor(
  options: TextDumpProcessorOptions = {},
) {
  const maxFileSize = options.maxFileSize ?? 1024 * 1024;

  return {
    async onFile({ fullPath, relativePath }) {
      let content = readFileSync(fullPath, 'utf8');

      if (content.length > maxFileSize) {
        return `[${relativePath}]:\n[SKIPPED: file too large]`;
      }

      let output = await minifyText(content, {
        filename: fullPath,
        syntax: 'auto',
        ecma: 2020,
        module: true,
        mangle: false,
        keep_classnames: true,
        keep_fnames: true,
      });

      content = output?.code || output?.content || null;

      return content ? `[${fullPath}]:\n${content}` : '';
    },

    finalize(items: unknown[]) {
      return items.filter(Boolean).join('\n\n');
    },
  };
}