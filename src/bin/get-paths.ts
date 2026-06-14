#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { getPaths } from '../index';

async function main(): Promise<void> {
    const { values } = parseArgs({
        strict: false,
        options: {
            input: { type: 'string' },
            output: { type: 'string' },
            format: { type: 'string' },
            fields: { type: 'string' },
            ignore: { type: 'string' },
            cwd: { type: 'string' },
            save: { type: 'boolean', short: 's' },
            processor: { type: 'string' },
        },
    });

    const input = String(values.input);
    const output = String(values.output);
    const save = Boolean(values.save);
    const format = (values.format as 'flat' | 'tree') || 'flat';

    if (!input) {
        throw new Error('Error: you need to specify --input');
    }

    let result = await getPaths({
        input,
        format: format,
        fields: values.fields
            ? (values.fields as any)
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean) as Array<keyof import('../lib/get-paths').PathItem>
            : undefined,
        ignore: values.ignore === undefined ? undefined : values.ignore,
        cwd: values.cwd,
        processor: values.processor,
    } as any);

    //result = JSON.stringify(result, null, 2) as any;

    if (save) {
        if (!output) {
            throw new Error('Error: when --save, you need to specify --output');
        }

        const resolvedOutput = path.resolve(output);
        await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
        await fs.writeFile(resolvedOutput, result as any, 'utf8');

        console.log(`The file is saved: ${resolvedOutput}`);
        return;
    }

    console.log(result);
}

main().catch((err) => {
    console.error('Error:', err?.message || err);
    process.exit(1);
});