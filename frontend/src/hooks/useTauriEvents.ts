import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from "@tauri-apps/api/core";

interface TauriEventsProps {
    onPlay: () => void;
    onPause: () => void;
    onNext: () => void;
    onPrev: () => void;
}

export const useTauriEvents = ({ onPlay, onPause, onNext, onPrev }: TauriEventsProps) => {
    const [isPedalConnected, setIsPedalConnected] = useState<boolean>(false);

    useEffect(() => {
        let unlistenAction: (() => void) | undefined;
        let unlistenFound: (() => void) | undefined;

        const setupListeners = async () => {
            // Check initial status
            try {
                const connected = await invoke<boolean>('is_pedal_connected');
                if (connected) setIsPedalConnected(true);
            } catch (e) {
                console.error("Error checking initial pedal status:", e);
            }

            // Listen for pedal detection
            unlistenFound = await listen<string>('pedal-found', () => {
                setIsPedalConnected(true);
            });

            // Listen for pedal actions
            unlistenAction = await listen<string>('pedal-action', (event) => {
                const shortcut = event.payload;
                switch (shortcut) {
                    case 'left-pressed':
                        onPrev();
                        break;
                    case 'center-pressed':
                        onPlay();
                        break;
                    case 'center-released':
                        onPause();
                        break;
                    case 'right-pressed':
                        onNext();
                        break;
                    default:
                        break;
                }
            });
        };

        setupListeners();

        // Cleanup listeners on component unmount
        return () => {
            unlistenAction?.();
            unlistenFound?.();
        };
    }, [onPlay, onPause, onNext, onPrev]); // Dependency array includes callbacks

    return { isPedalConnected };
};
