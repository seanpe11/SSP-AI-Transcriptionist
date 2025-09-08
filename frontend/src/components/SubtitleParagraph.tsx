import React from 'react';
import { FaPlay, FaClipboard } from 'react-icons/fa';
import { SubtitleEntry } from '../types';


// Define the props the component will receive from App.tsx
interface SubtitleTableProps {
  sortedSubtitles: SubtitleEntry[];
  currentTime: number;
  setIsPlaying: (playing: boolean) => void;
  jumpToTime: (time: number) => void;
  updateSubtitleText: (id: number, text: string) => void;
  markSubtitleChecked: (id: number, checked: boolean) => void;
  copySegmentToClipboard: (subtitle: SubtitleEntry) => void;
}

const SubtitleTable: React.FC<SubtitleTableProps> = ({
  sortedSubtitles,
  currentTime,
  setIsPlaying,
  jumpToTime,
  updateSubtitleText,
  markSubtitleChecked,
  copySegmentToClipboard,
}) => {
  return (
    <div>
      {sortedSubtitles.map((subtitle) => {
        return (
          <span
            onClick={() => { jumpToTime(subtitle.startTime); setIsPlaying(true); }}
            className={`${currentTime >= subtitle.startTime && currentTime < subtitle.endTime ? 'bg-blue-200' : ''}`}
          >
            {subtitle.text + " "}
          </span>
        )
      })}
    </div>
  );
};

export default SubtitleTable;

