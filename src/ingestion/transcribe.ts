// Whisper API wrapper for audio/video transcription
// Handles MP3, MP4, M4A, WAV files
// For YouTube/podcast URLs, use yt-dlp to download audio first

import OpenAI from 'openai';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');

export async function transcribeAudio(filePath: string): Promise<string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  const fileSizeMB = stat.size / (1024 * 1024);

  // Whisper API has a 25MB limit
  if (fileSizeMB > 25) {
    console.log(`File is ${fileSizeMB.toFixed(1)}MB - splitting into chunks...`);
    return await transcribeLargeFile(filePath);
  }

  console.log(`Transcribing ${path.basename(filePath)} (${fileSizeMB.toFixed(1)}MB)...`);

  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'whisper-1',
    language: 'en',
  });

  return response.text;
}

async function transcribeLargeFile(filePath: string): Promise<string> {
  // Split into 20MB chunks using ffmpeg
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const chunkDir = path.join(DOWNLOADS_DIR, `${baseName}_chunks`);

  fs.mkdirSync(chunkDir, { recursive: true });

  // Split into 10-minute segments
  execSync(
    `ffmpeg -i "${filePath}" -f segment -segment_time 600 -c copy "${chunkDir}/chunk_%03d${ext}"`,
    { stdio: 'pipe' }
  );

  const chunkFiles = fs
    .readdirSync(chunkDir)
    .filter((f) => f.startsWith('chunk_'))
    .sort();

  const transcripts: string[] = [];

  for (const chunkFile of chunkFiles) {
    const chunkPath = path.join(chunkDir, chunkFile);
    console.log(`  Transcribing chunk: ${chunkFile}`);

    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(chunkPath),
      model: 'whisper-1',
      language: 'en',
    });

    transcripts.push(response.text);
  }

  // Clean up chunks
  fs.rmSync(chunkDir, { recursive: true, force: true });

  return transcripts.join('\n\n');
}

export async function downloadAndTranscribe(url: string): Promise<{
  title: string;
  transcript: string;
}> {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

  console.log(`Downloading audio from: ${url}`);

  // Use yt-dlp to download audio as MP3
  const output = execSync(
    `yt-dlp -x --audio-format mp3 --print filename -o "${DOWNLOADS_DIR}/%(title)s.%(ext)s" "${url}"`,
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim();

  // yt-dlp prints the filename - extract it
  const mp3Path = output.replace(/\.\w+$/, '.mp3');
  const title = path.basename(mp3Path, '.mp3');

  if (!fs.existsSync(mp3Path)) {
    throw new Error(`Download failed - file not found: ${mp3Path}`);
  }

  const transcript = await transcribeAudio(mp3Path);

  // Clean up the downloaded file
  fs.unlinkSync(mp3Path);

  return { title, transcript };
}
