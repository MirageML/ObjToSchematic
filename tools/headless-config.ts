import { TextureFiltering } from '../src/texture';
import { ColourSpace } from '../src/util';
import { THeadlessConfig } from './headless';

export const headlessConfig: THeadlessConfig = {
    import: {
        filepath: process.argv[2], // Must be an absolute path
    },
    voxelise: {
        voxeliser: 'bvh-ray',
        desiredHeight: parseInt(process.argv[3]),
        useMultisampleColouring: false,
        textureFiltering: TextureFiltering.Linear,
        voxelOverlapRule: 'average',
        enableAmbientOcclusion: false, // Only want true if exporting to .obj
    },
    assign: {
        textureAtlas: 'vanilla', // Must be an atlas name that exists in /resources/atlases
        blockPalette: 'all-snapshot', // Must be a palette name that exists in /resources/palettes
        blockAssigner: 'ordered-dithering',
        colourSpace: ColourSpace.RGB,
        fallable: 'replace-falling',
        resolution: 32,
    },
    export: {
        filepath: '/tmp/s3/mesh.' + process.argv[4], // Must be an absolute path to the file (can be anywhere)
        exporter: process.argv[4], // 'schematic' / 'litematic',
    },
    debug: {
        showLogs: true,
        showWarnings: true,
        showTimings: true,
    },
};
