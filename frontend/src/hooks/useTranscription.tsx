import { useState, useEffect } from 'react';
const API_BASE_URL = 'https://ssp-whisper-worker.sean-m-s-pe.workers.dev';
import { invoke } from "@tauri-apps/api/core"

const convertToMp3 = async (file: File): Promise<File> => {

  return file;
}

const splitTo24mbChunks = (file: File, chunkSize: number = 24 * 1024 * 1024): File[] => {
  return [file];
}

export const useTranscription = () => {

}
