// src/fileUtils.ts
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// Lazily load the FFmpeg instance to avoid loading it on app startup.
let ffmpegInstance: FFmpeg | null = null;

const loadFFmpeg = async (): Promise<FFmpeg> => {
    if (ffmpegInstance) {
        return ffmpegInstance;
    }
    const ffmpeg = new FFmpeg();
    // The location of the core FFmpeg files.
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegInstance = ffmpeg;
    return ffmpegInstance;
};

/**
 * Converts any audio file to MP3 format using ffmpeg.wasm.
 * This is particularly useful for formats not supported by browsers, like .ds2.
 * @param file The audio file to convert.
 * @returns A promise that resolves to the converted MP3 file.
 */
export const convertToMp3 = async (file: File): Promise<File> => {
    const ffmpeg = await loadFFmpeg();
    const inputFileName = `input.${file.name.split('.').pop()}`;
    const outputFileName = 'output.mp3';

    console.log(`Starting conversion for ${file.name}...`);
    // Write the source file to FFmpeg's virtual file system
    await ffmpeg.writeFile(inputFileName, await fetchFile(file));

    // Run the FFmpeg command to convert to a standard MP3 format
    await ffmpeg.exec(['-i', inputFileName, '-vn', '-b:a', '192k', outputFileName]);

    // Read the resulting MP3 file from the virtual file system
    const data = await ffmpeg.readFile(outputFileName);

    // Clean up the virtual files
    await ffmpeg.deleteFile(inputFileName);
    await ffmpeg.deleteFile(outputFileName);

    console.log('Conversion complete.');

    const mp3Blob = new Blob([data], { type: 'audio/mpeg' });
    // Create a new file name with the .mp3 extension
    const mp3FileName = `${file.name.split('.').slice(0, -1).join('.')}.mp3`;

    return new File([mp3Blob], mp3FileName, { type: 'audio/mpeg' });
};

/**
 * Splits a file into smaller chunks of a specified size.
 * This is useful for APIs that have a file size limit.
 * @param file The file to split (should be an MP3).
 * @param chunkSize The size of each chunk in bytes. Defaults to 20MB.
 * @returns An array of File objects representing the chunks.
 */
export const splitChunks = (file: File, chunkSize: number = 20 * 1024 * 1024): File[] => {
    // If the file is smaller than the chunk size, return it as the only chunk.
    if (file.size <= chunkSize) {
        return [file];
    }

    const chunks: File[] = [];
    const totalChunks = Math.ceil(file.size / chunkSize);
    const baseName = file.name.replace(/\.[^/.]+$/, ""); // remove extension

    console.log(`Splitting ${file.name} into ${totalChunks} chunks of size ${chunkSize} bytes.`);

    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunkBlob = file.slice(start, end);
        // Name chunks sequentially for easy reassembly on the backend
        const chunkFile = new File([chunkBlob], `${baseName}-part-${i + 1}-of-${totalChunks}.mp3`, { type: 'audio/mpeg' });
        chunks.push(chunkFile);
    }

    return chunks;
};
