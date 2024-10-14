import React, { useState, useRef } from 'react';
import { Upload, Play, Zap, AlignCenter, MessageSquare, Wand2 } from 'lucide-react';
import SubtitleProcessor from './SubtitleProcessor';

function App() {
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [processedSubtitles, setProcessedSubtitles] = useState<string | null>(null);
  const subtitleProcessor = useRef(new SubtitleProcessor());

  const handleSubtitleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSubtitleFile(event.target.files[0]);
    }
  };

  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setVideoFile(event.target.files[0]);
    }
  };

  const processSubtitles = async (action: string) => {
    if (!subtitleFile) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      if (e.target?.result) {
        const content = e.target.result as string;
        let result: string;

        switch (action) {
          case 'fix':
            result = await subtitleProcessor.current.fixCaptions(content);
            break;
          case 'cover':
            result = await subtitleProcessor.current.coverScreen(content);
            break;
          case 'speakers':
            result = await subtitleProcessor.current.addSpeakerDashes(content);
            break;
          case 'sync':
            result = await subtitleProcessor.current.syncSubtitles(content);
            break;
          case 'all':
            result = await subtitleProcessor.current.processAll(content);
            break;
          default:
            result = content;
        }

        setProcessedSubtitles(result);
      }
    };
    reader.readAsText(subtitleFile);
  };

  const downloadProcessedSubtitles = () => {
    if (processedSubtitles) {
      const blob = new Blob([processedSubtitles], { type: 'text/vtt' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'processed_subtitles.vtt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-8">Subtitle Management</h1>
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Subtitle File (.vtt)
          </label>
          <input
            type="file"
            accept=".vtt"
            onChange={handleSubtitleUpload}
            className="w-full p-2 border border-gray-300 rounded"
          />
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Video File (.mp4)
          </label>
          <input
            type="file"
            accept=".mp4"
            onChange={handleVideoUpload}
            className="w-full p-2 border border-gray-300 rounded"
          />
        </div>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => processSubtitles('fix')}
            className="flex items-center justify-center bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
          >
            <Zap className="mr-2" /> Captions Fixing
          </button>
          <button
            onClick={() => processSubtitles('cover')}
            className="flex items-center justify-center bg-green-500 text-white p-2 rounded hover:bg-green-600"
          >
            <AlignCenter className="mr-2" /> Covering Screen
          </button>
          <button
            onClick={() => processSubtitles('speakers')}
            className="flex items-center justify-center bg-yellow-500 text-white p-2 rounded hover:bg-yellow-600"
          >
            <MessageSquare className="mr-2" /> Missing Speaker Dashes
          </button>
          <button
            onClick={() => processSubtitles('sync')}
            className="flex items-center justify-center bg-purple-500 text-white p-2 rounded hover:bg-purple-600"
          >
            <Play className="mr-2" /> Sync
          </button>
          <button
            onClick={() => processSubtitles('all')}
            className="flex items-center justify-center bg-red-500 text-white p-2 rounded hover:bg-red-600 col-span-2"
          >
            <Wand2 className="mr-2" /> Il Picchio (All-in-one)
          </button>
        </div>
        {processedSubtitles && (
          <div className="mt-6">
            <h2 className="text-xl font-semibold mb-2">Processed Subtitles</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-60">
              {processedSubtitles}
            </pre>
            <button
              onClick={downloadProcessedSubtitles}
              className="mt-4 bg-indigo-500 text-white p-2 rounded hover:bg-indigo-600 flex items-center justify-center"
            >
              <Upload className="mr-2" /> Download Processed Subtitles
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;