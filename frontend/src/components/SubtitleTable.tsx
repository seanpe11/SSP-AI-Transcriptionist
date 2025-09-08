import React from 'react';
import { FaPlay, FaClipboard } from 'react-icons/fa';
import { SubtitleEntry } from '../types';

// Helper function to format time, moved here as it's only used in this component
const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

// Helper function for confidence color
const colorForConfidence = (confidence: number | undefined): string => {
  if (confidence === undefined) return 'text-gray-500';
  if (confidence < 0.5) return 'text-red-500';
  if (confidence < 0.75) return 'text-yellow-500';
  return 'text-green-500';
};

// Define the props the component will receive from App.tsx
interface SubtitleTableProps {
  sortedSubtitles: SubtitleEntry[];
  currentTime: number;
  tableBodyRef: React.RefObject<HTMLTableSectionElement>;
  setIsPlaying: (playing: boolean) => void;
  jumpToTime: (time: number) => void;
  updateSubtitleText: (id: number, text: string) => void;
  markSubtitleChecked: (id: number, checked: boolean) => void;
  copySegmentToClipboard: (subtitle: SubtitleEntry) => void;
}

const SubtitleTable: React.FC<SubtitleTableProps> = ({
  sortedSubtitles,
  currentTime,
  tableBodyRef,
  setIsPlaying,
  jumpToTime,
  updateSubtitleText,
  markSubtitleChecked,
  copySegmentToClipboard,
}) => {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50 sticky top-0 z-10">
        <tr>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Text</th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider text-center">Checked</th>
        </tr>
      </thead>
      <tbody ref={tableBodyRef} className="bg-white divide-y divide-gray-200">
        {sortedSubtitles.map((subtitle) => (
          <tr
            key={subtitle.id}
            className={`${currentTime >= subtitle.startTime && currentTime < subtitle.endTime ? 'bg-blue-50' : ''}`}
          >
            <td className="px-6 py-4 w-1/4 whitespace-nowrap text-sm text-gray-500">
              <div className="flex items-center space-x-2">
                <button onClick={() => { jumpToTime(subtitle.startTime); setIsPlaying(true); }} className="p-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors" title="Jump to time"><FaPlay className="w-3 h-3" /></button>
                <span className="font-mono">{formatTime(subtitle.startTime)}</span>
                <span className={colorForConfidence(subtitle.confidence)}>{subtitle.confidence !== undefined ? `${(subtitle.confidence * 100).toFixed(0)}%` : ''}</span>
              </div>
            </td>
            <td className="px-6 py-4 w-1/2 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <textarea
                  value={subtitle.text}
                  onChange={(e) => updateSubtitleText(subtitle.id, e.target.value)}
                  // @ts-ignore
                  style={{ fieldSizing: 'content' }}
                  className="w-full border rounded px-3 py-2 text-sm font-mono bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-500 resize-none"
                  placeholder="Enter subtitle text..."
                />
                <button
                  onClick={() => copySegmentToClipboard(subtitle)}
                  className="inline-flex items-center p-2 border border-transparent rounded-md shadow-sm text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors"
                  title="Copy segment text"
                >
                  <FaClipboard className="h-4 w-4" />
                </button>
              </div>
            </td>
            <td className="px-6 py-4 w-1/4 text-sm text-gray-500 text-center">
              <input type="checkbox" checked={!!subtitle.checked} onChange={(e) => markSubtitleChecked(subtitle.id, e.target.checked)} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default SubtitleTable;
