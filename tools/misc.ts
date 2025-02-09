import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import prompt from 'prompt';

import { RGBA } from '../src/colour';
import { AppPaths } from '../src/util/path_util';
import { log, LogStyle } from './logging';

export const ASSERT = (condition: boolean, onFailMessage: string) => {
    if (!condition) {
        log(LogStyle.Failure, onFailMessage);
        process.exit(0);
    }
};

export function isDirSetup(relativePath: string, jarAssetDir: string) {
    const dir = path.join(AppPaths.Get.tools, relativePath);
    if (fs.existsSync(dir)) {
        if (fs.readdirSync(dir).length > 0) {
            return true;
        }
    } else {
        fs.mkdirSync(dir);
    }
    log(LogStyle.Warning, `Copy the contents of .minecraft/versions/<version>/<version>.jar/${jarAssetDir} from a Minecraft game files into ${relativePath} or fetch them automatically`);
    return false;
}

export function getAverageColour(image: PNG): RGBA {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let weight = 0;
    for (let x = 0; x < image.width; ++x) {
        for (let y = 0; y < image.height; ++y) {
            const index = 4 * (image.width * y + x);
            const rgba = image.data.slice(index, index + 4);
            const alpha = rgba[3] / 255;
            r += (rgba[0] / 255) * alpha;
            g += (rgba[1] / 255) * alpha;
            b += (rgba[2] / 255) * alpha;
            a += alpha;
            weight += alpha;
        }
    }
    const numPixels = image.width * image.height;
    return {
        r: r / weight,
        g: g / weight,
        b: b / weight,
        a: a / numPixels,
    };
}

export async function getPermission() {
    const directory = getMinecraftDir();
    log(LogStyle.Info, `This script requires files inside of ${directory}`);
    const { permission } = await prompt.get({
        properties: {
            permission: {
                pattern: /^[YyNn]$/,
                description: 'Do you give permission to access these files? (Y/n)',
                message: 'Response must be Y or N',
                required: true,
            },
        },
    });
    const responseYes = ['Y', 'y'].includes(permission as string);
    if (!responseYes) {
        process.exit(0);
    }
}

export function getMinecraftDir(): string {
    switch (process.platform) {
        case 'darwin': // MacOS
            return path.join(process.env.HOME!, './Library/Application Support/minecraft');
        case 'win32': // Windows
            return path.join(process.env.APPDATA!, './.minecraft');
        default:
            return path.join(require('os').homedir(), '/.minecraft');
    }
}
