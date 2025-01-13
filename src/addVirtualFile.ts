import * as path from 'node:path';
import {Readable} from 'node:stream';

// @ts-expect-error
import toThrough from 'to-through';
import Vinyl from 'vinyl';

export function addVirtualFile({
    fileName,
    text,
    base = process.cwd(),
}: {
    fileName: string;
    text: string;
    base: string;
}) {
    return toThrough(
        Readable.from([
            new Vinyl({
                contents: Buffer.from(text, 'utf-8'),
                path: path.resolve(fileName),
                base: path.resolve(base),
            }),
        ]),
    );
}
