import AdmZip from 'adm-zip';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import prompt from 'prompt';
import * as sharp from 'sharp';
const copydir = require('copy-dir');

import { RGBA } from '../src/colour';
import { UV } from '../src/util';
import { AppPaths, PathUtil } from '../src/util/path_util';
import { log, LogStyle } from './logging';
import { ASSERT, getAverageColour, getMinecraftDir, getPermission, isDirSetup } from './misc'; ;

const BLOCKS_DIR = PathUtil.join(AppPaths.Get.tools, '/blocks');
const MODELS_DIR = PathUtil.join(AppPaths.Get.tools, '/models');

void async function main() {
    AppPaths.Get.setBaseDir(PathUtil.join(__dirname, '../..'));

    await getPermission();
    checkMinecraftInstallation();
    cleanupDirectories();
    await fetchModelsAndTextures();
    await buildAtlas();
    cleanupDirectories();
}();

function checkMinecraftInstallation() {
    const dir = getMinecraftDir();
    if (!fs.existsSync(dir)) {
        log(LogStyle.Failure, `Could not find ${dir}`);
        log(LogStyle.Failure, 'To use this tool you need to install Minecraft Java Edition');
        process.exit(1);
    } else {
        log(LogStyle.Success, `Found Minecraft Java Edition installation at ${dir}`);
    }
}

function cleanupDirectories() {
    fs.rmSync(BLOCKS_DIR, { recursive: true, force: true });
    fs.rmSync(MODELS_DIR, { recursive: true, force: true });
}

async function getResourcePack() {
    const resourcePacksDir = path.join(getMinecraftDir(), './resourcepacks');
    if (!fs.existsSync(resourcePacksDir)) {
        log(LogStyle.Failure, 'Could not find .minecraft/resourcepacks\n');
        process.exit(1);
    }

    log(LogStyle.Info, 'Looking for resource packs...');
    const resourcePacks = fs.readdirSync(resourcePacksDir);
    log(LogStyle.None, `1) Vanilla`);
    for (let i = 0; i < resourcePacks.length; ++i) {
        log(LogStyle.None, `${i + 2}) ${resourcePacks[i]}`);
    }

    const { packChoice } = await prompt.get({
        properties: {
            packChoice: {
                description: `Which resource pack do you want to build an atlas for? (1-${resourcePacks.length + 1})`,
                message: `Response must be between 1 and ${resourcePacks.length + 1}`,
                required: true,
                conform: (value) => {
                    return value >= 1 && value <= resourcePacks.length + 1;
                },
            },
        },
    });
    if (<number>packChoice == 1) {
        return 'Vanilla';
    }
    return resourcePacks[(<number>packChoice) - 2];
}

function fetchVanillModelsAndTextures(fetchTextures: boolean) {
    const versionsDir = path.join(getMinecraftDir(), './versions');
    ASSERT(fs.existsSync(versionsDir), 'Could not find .minecraft/versions');
    log(LogStyle.Info, '.minecraft/versions found successfully');

    const versions = fs.readdirSync(versionsDir)
        .filter((file) => fs.lstatSync(path.join(versionsDir, file)).isDirectory())
        .map((file) => ({ file, birthtime: fs.lstatSync(path.join(versionsDir, file)).birthtime }))
        .sort((a, b) => b.birthtime.getTime() - a.birthtime.getTime());

    for (let i = 0; i < versions.length; ++i) {
        const versionName = versions[i].file;
        log(LogStyle.Info, `Searching in ${versionName} for ${versionName}.jar`);

        const versionDir = path.join(versionsDir, versionName);
        const versionFiles = fs.readdirSync(versionDir);
        if (!versionFiles.includes(versionName + '.jar')) {
            continue;
        }
        log(LogStyle.Success, `Found ${versionName}.jar successfully\n`);

        const versionJarPath = path.join(versionDir, `${versionName}.jar`);

        log(LogStyle.Info, `Upzipping ${versionName}.jar...`);
        const zip = new AdmZip(versionJarPath);
        const zipEntries = zip.getEntries();
        zipEntries.forEach((zipEntry: any) => {
            if (fetchTextures && zipEntry.entryName.startsWith('assets/minecraft/textures/block')) {
                zip.extractEntryTo(zipEntry.entryName, BLOCKS_DIR, false, true);
            } else if (zipEntry.entryName.startsWith('assets/minecraft/models/block')) {
                zip.extractEntryTo(zipEntry.entryName, MODELS_DIR, false, true);
            }
        });
        log(LogStyle.Success, `Extracted textures and models successfully\n`);
        return;
    }
}

async function fetchModelsAndTextures() {
    const resourcePack = await getResourcePack();
    await fetchVanillModelsAndTextures(true);
    if (resourcePack === 'Vanilla') {
        return;
    }

    log(LogStyle.Warning, 'Non-16x16 texture packs are not supported');

    const resourcePackDir = path.join(getMinecraftDir(), './resourcepacks', resourcePack);
    if (fs.lstatSync(resourcePackDir).isDirectory()) {
        log(LogStyle.Info, `Resource pack '${resourcePack}' is a directory`);
        const blockTexturesSrc = path.join(resourcePackDir, 'assets/minecraft/textures/block');
        const blockTexturesDst = BLOCKS_DIR;
        log(LogStyle.Info, `Copying ${blockTexturesSrc} to ${blockTexturesDst}`);
        copydir(blockTexturesSrc, blockTexturesDst, {
            utimes: true,
            mode: true,
            cover: true,
        });
        log(LogStyle.Success, `Copied block textures successfully`);
    } else {
        log(LogStyle.Info, `Resource pack '${resourcePack}' is not a directory, expecting to be a .zip`);

        const zip = new AdmZip(resourcePackDir);
        const zipEntries = zip.getEntries();
        zipEntries.forEach((zipEntry: any) => {
            if (zipEntry.entryName.startsWith('assets/minecraft/textures/block')) {
                zip.extractEntryTo(zipEntry.entryName, BLOCKS_DIR, false, true);
            }
        });
        log(LogStyle.Success, `Copied block textures successfully`);
        return;
    }
}

async function buildAtlas() {
    // Check /blocks and /models is setup correctly
    log(LogStyle.Info, 'Checking assets are provided...');

    const texturesDirSetup = isDirSetup('./blocks', 'assets/minecraft/textures/block');
    ASSERT(texturesDirSetup, '/blocks is not setup correctly');
    log(LogStyle.Success, '/tools/blocks/ setup correctly');

    const modelsDirSetup = isDirSetup('./models', 'assets/minecraft/models/block');
    ASSERT(modelsDirSetup, '/models is not setup correctly');
    log(LogStyle.Success, '/tools/models/ setup correctly');

    // Load the ignore list
    log(LogStyle.Info, 'Loading ignore list...');
    let ignoreList: Array<string> = [];
    const ignoreListPath = path.join(AppPaths.Get.tools, './ignore-list.txt');
    if (fs.existsSync(ignoreListPath)) {
        log(LogStyle.Success, 'Found ignore list');
        ignoreList = fs.readFileSync(ignoreListPath, 'utf-8').replace(/\r/g, '').split('\n');
    } else {
        log(LogStyle.Warning, 'No ignore list found, looked for ignore-list.txt');
    }
    log(LogStyle.Success, `${ignoreList.length} blocks found in ignore list\n`);

    /* eslint-disable */
    enum parentModel {
        Cube = 'minecraft:block/cube',
        CubeAll = 'minecraft:block/cube_all',
        CubeColumn = 'minecraft:block/cube_column',
        CubeColumnHorizontal = 'minecraft:block/cube_column_horizontal',
        CubeBottomTop = 'minecraft:block/cube_bottom_top',
        TemplateSingleFace = 'minecraft:block/template_single_face',
        TemplateGlazedTerracotta = 'minecraft:block/template_glazed_terracotta',
        Leaves = 'minecraft:block/leaves',
    }
    /* eslint-enable */

    interface Model {
        name: string,
        colour?: RGBA,
        faces: {
            [face: string]: Texture
        }
    }

    interface Texture {
        name: string,
        texcoord?: UV,
        colour?: RGBA
    }

    log(LogStyle.Info, 'Loading block models...');
    const faces = ['north', 'south', 'up', 'down', 'east', 'west'];
    const allModels: Array<Model> = [];
    const allBlockNames: Set<string> = new Set();
    const usedTextures: Set<string> = new Set();
    fs.readdirSync(MODELS_DIR).forEach((filename) => {
        if (path.extname(filename) !== '.json') {
            return;
        };

        const filePath = path.join(MODELS_DIR, filename);
        const fileData = fs.readFileSync(filePath, 'utf8');
        const modelData = JSON.parse(fileData);
        const parsedPath = path.parse(filePath);
        const modelName = parsedPath.name;

        if (ignoreList.includes(filename)) {
            return;
        }

        let faceData: { [face: string]: Texture } = {};
        switch (modelData.parent) {
            case parentModel.CubeAll:
                faceData = {
                    up: { name: modelData.textures.all },
                    down: { name: modelData.textures.all },
                    north: { name: modelData.textures.all },
                    south: { name: modelData.textures.all },
                    east: { name: modelData.textures.all },
                    west: { name: modelData.textures.all },
                };
                break;
            case parentModel.CubeColumn:
                faceData = {
                    up: { name: modelData.textures.end },
                    down: { name: modelData.textures.end },
                    north: { name: modelData.textures.side },
                    south: { name: modelData.textures.side },
                    east: { name: modelData.textures.side },
                    west: { name: modelData.textures.side },
                };
                break;
            case parentModel.CubeBottomTop:
                faceData = {
                    up: { name: modelData.textures.top },
                    down: { name: modelData.textures.bottom },
                    north: { name: modelData.textures.side },
                    south: { name: modelData.textures.side },
                    east: { name: modelData.textures.side },
                    west: { name: modelData.textures.side },
                };
                break;
            case parentModel.Cube:
                faceData = {
                    up: { name: modelData.textures.up },
                    down: { name: modelData.textures.down },
                    north: { name: modelData.textures.north },
                    south: { name: modelData.textures.south },
                    east: { name: modelData.textures.east },
                    west: { name: modelData.textures.west },
                };
                break;
            case parentModel.TemplateSingleFace:
                faceData = {
                    up: { name: modelData.textures.texture },
                    down: { name: modelData.textures.texture },
                    north: { name: modelData.textures.texture },
                    south: { name: modelData.textures.texture },
                    east: { name: modelData.textures.texture },
                    west: { name: modelData.textures.texture },
                };
                break;
            case parentModel.TemplateGlazedTerracotta:
                faceData = {
                    up: { name: modelData.textures.pattern },
                    down: { name: modelData.textures.pattern },
                    north: { name: modelData.textures.pattern },
                    south: { name: modelData.textures.pattern },
                    east: { name: modelData.textures.pattern },
                    west: { name: modelData.textures.pattern },
                };
                break;
            case parentModel.Leaves:
                faceData = {
                    up: { name: modelData.textures.all },
                    down: { name: modelData.textures.all },
                    north: { name: modelData.textures.all },
                    south: { name: modelData.textures.all },
                    east: { name: modelData.textures.all },
                    west: { name: modelData.textures.all },
                };
                break;
            default:
                return;
        }

        for (const face of faces) {
            usedTextures.add(faceData[face].name);
        }

        allModels.push({
            name: modelName,
            faces: faceData,
        });
        allBlockNames.add(modelName);
    });
    if (allModels.length === 0) {
        log(LogStyle.Failure, 'No blocks loaded');
        process.exit(0);
    }
    log(LogStyle.Success, `${allModels.length} blocks loaded\n`);

    const atlasSize = Math.ceil(Math.sqrt(usedTextures.size));
    const atlasWidthPixels = atlasSize * 16 * 3;

    let offsetX = 0;
    let offsetY = 0;

    const textureDetails: { [textureName: string]: { texcoord: UV, colour: RGBA } } = {};

    const { atlasName } = await prompt.get({
        properties: {
            atlasName: {
                pattern: /^[a-zA-Z\-]+$/,
                description: 'What do you want to call this texture atlas?',
                message: 'Name must only be letters or dash',
                required: true,
            },
        },
    });

    //const tiles: mergeImages.ImageSource[] = [];
    let outputImage = sharp.default({
        create: {
            width: atlasWidthPixels,
            height: atlasWidthPixels,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 0.0 },
        },
    });

    const composites: sharp.OverlayOptions[] = [];

    log(LogStyle.Info, `Building ${atlasName}.png...`);
    usedTextures.forEach((textureName) => {
        const shortName = textureName.split('/')[1]; // Eww
        const absolutePath = path.join(BLOCKS_DIR, shortName + '.png');

        for (let x = 0; x < 3; ++x) {
            for (let y = 0; y < 3; ++y) {
                composites.push({
                    input: absolutePath,
                    left: 16 * (3 * offsetX + x),
                    top: 16 * (3 * offsetY + y),
                });
            }
        }

        const fileData = fs.readFileSync(absolutePath);
        const pngData = PNG.sync.read(fileData);

        textureDetails[textureName] = {
            texcoord: new UV(
                16 * (3 * offsetX + 1) / atlasWidthPixels,
                16 * (3 * offsetY + 1) / atlasWidthPixels,
            ),
            colour: getAverageColour(pngData),
        };

        ++offsetX;
        if (offsetX >= atlasSize) {
            ++offsetY;
            offsetX = 0;
        }
    });

    outputImage = outputImage.composite(composites);


    // Build up the output JSON
    log(LogStyle.Info, `Building ${atlasName}.atlas...\n`);
    for (const model of allModels) {
        const blockColour: RGBA = {
            r: 0.0, g: 0.0, b: 0.0, a: 0.0,
        };
        for (const face of faces) {
            const faceTexture = textureDetails[model.faces[face].name];
            const faceColour = faceTexture.colour;
            blockColour.r += faceColour.r;
            blockColour.g += faceColour.g;
            blockColour.b += faceColour.b;
            blockColour.a += faceColour.a;
            model.faces[face].texcoord = faceTexture.texcoord;
        }
        blockColour.r /= 6;
        blockColour.g /= 6;
        blockColour.b /= 6;
        blockColour.a /= 6;
        model.colour = blockColour;
    }


    log(LogStyle.Info, 'Exporting...');
    const atlasTextureDir = path.join(AppPaths.Get.atlases, `./${atlasName}.png`);
    await outputImage.toFile(atlasTextureDir);
    //ASSERT(success, 'Unsuccess save');

    log(LogStyle.Success, `${atlasName}.png exported to /resources/atlases/`);
    const outputJSON = {
        atlasSize: atlasSize,
        blocks: allModels,
        supportedBlockNames: Array.from(allBlockNames),
    };
    fs.writeFileSync(path.join(AppPaths.Get.atlases, `./${atlasName}.atlas`), JSON.stringify(outputJSON, null, 4));
    log(LogStyle.Success, `${atlasName}.atlas exported to /resources/atlases/\n`);

    /* eslint-disable */
    console.log(chalk.cyanBright(chalk.inverse('DONE') + ' Now run ' + chalk.inverse(' npm start ') + ' and the new texture atlas can be used'));
    /* eslint-enable */
}
