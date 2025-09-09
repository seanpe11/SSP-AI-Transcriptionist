import { useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core"
import { listen } from '@tauri-apps/api/event'
import { SubtitleEntry } from '../types'

interface UsePedalProps {
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
  jumpToTime: (time: number) => void,
  currentEditIndexRef: React.MutableRefObject<number | null>,
  sortedSubtitlesRef: React.MutableRefObject<SubtitleEntry[]>,
  setIsPedalConnected: React.Dispatch<React.SetStateAction<boolean>>,
}


export const usePedal = ({
  setIsPlaying,
  audioRef,
  jumpToTime,
  currentEditIndexRef,
  sortedSubtitlesRef,
  setIsPedalConnected,
}: UsePedalProps) => {
  // check pedal connection
  useEffect(() => {
    const checkInitialStatus = async () => {
      try {
        const connected = await invoke<boolean>('is_pedal_connected');
        if (connected) {
          setIsPedalConnected(true);
          console.log("Pedal was already connected on startup.");
        }
      } catch (e) {
        console.error("Error checking initial pedal status:", e);
      }
    };

    (async () => { await checkInitialStatus() })();

    const listenForPedalDetection = async () => {
      const unlisten = await listen<string>('pedal-found', () => {
        setIsPedalConnected(true);
      })
      return unlisten
    }

    const setupListener = async () => {
      const unlisten = await listen<string>('pedal-action', (event) => {
        const shortcut = event.payload;
        console.log(shortcut)
        switch (shortcut) {
          case 'left-pressed': {
            const currentIndex = currentEditIndexRef.current;
            const currentSubtitles = sortedSubtitlesRef.current;

            if (currentIndex !== null && audioRef.current) {
              // If we're at the start of a segment, jump to the previous one
              if (audioRef.current.currentTime <= currentSubtitles[currentIndex].startTime + 0.1 && currentIndex > 0) {
                jumpToTime(currentSubtitles[currentIndex - 1].startTime);
              } else if (currentIndex <= 0) {
                jumpToTime(0);
              } else {
                jumpToTime(currentSubtitles[currentIndex].startTime);
              }
            } else {
              // If no active segment, jump to the beginning
              jumpToTime(0);
            }
            break;
          }

          case 'center-pressed':
            setIsPlaying(true);
            break;

          case 'center-released':
            setIsPlaying(false);
            break;

          case 'right-pressed': {
            const currentIndex = currentEditIndexRef.current;
            const currentSubtitles = sortedSubtitlesRef.current;

            if (currentIndex !== null && currentIndex < currentSubtitles.length - 1) {
              console.log(`Current IDX: ${currentIndex}, moving to ${currentIndex + 1}, ${currentSubtitles[currentIndex].startTime}, ${currentSubtitles[currentIndex + 1].startTime}`)
              jumpToTime(currentSubtitles[currentIndex + 1].startTime);
              // @ts-ignore
              setCurrentEditIndex((prev) => prev + 1);
            }
            break;
          }

          default:
            break;
        }
      });
      return unlisten;
    };

    const unlistenPromise = setupListener();
    const unlistenPedalPromise = listenForPedalDetection();

    // Cleanup the listener when the component unmounts
    return () => {
      unlistenPromise.then(unlisten => unlisten());
      unlistenPedalPromise.then(unlisten => unlisten());
    };
  }, []); // Empty dependency array ensures this runs only once
}
