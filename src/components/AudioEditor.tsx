import React, { useState, useRef, useEffect } from 'react';
import { Play, Square, Scissors, Save, X, Settings2, RotateCcw } from 'lucide-react';
import { base64ToFloat32Array, getAudioDuration, processAudio } from '../lib/audio';

interface AudioEditorProps {
  audioBase64: string;
  onSave: (newBase64: string, newDuration: number) => void;
  onCancel: () => void;
}

export function AudioEditor({ audioBase64, onSave, onCancel }: AudioEditorProps) {
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    const dur = getAudioDuration(audioBase64);
    setDuration(dur);
    setEndTime(dur);
  }, [audioBase64]);

  const handlePlayPreview = async () => {
    stopPreview();
    setIsProcessing(true);
    
    try {
      const processedBase64 = await processAudio(audioBase64, {
        speed, volume, startTime, endTime
      });
      
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = ctx;

      const float32Data = base64ToFloat32Array(processedBase64);
      const buffer = ctx.createBuffer(1, float32Data.length, 24000);
      buffer.getChannelData(0).set(float32Data);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      
      source.onended = () => {
        setIsPlaying(false);
        audioSourceRef.current = null;
      };

      source.start();
      audioSourceRef.current = source;
      setIsPlaying(true);
    } catch (e) {
      console.error(e);
      alert("Lỗi khi xử lý âm thanh.");
    } finally {
      setIsProcessing(false);
    }
  };

  const stopPreview = () => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch(e){}
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleSave = async () => {
    stopPreview();
    setIsProcessing(true);
    try {
      const processedBase64 = await processAudio(audioBase64, {
        speed, volume, startTime, endTime
      });
      const newDuration = getAudioDuration(processedBase64);
      onSave(processedBase64, newDuration);
    } catch (e) {
      console.error(e);
      alert("Lỗi khi lưu âm thanh.");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetSettings = () => {
    setStartTime(0);
    setEndTime(duration);
    setSpeed(1);
    setVolume(1);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-orange-500" />
            Chỉnh sửa Audio
          </h3>
          <button onClick={() => { stopPreview(); onCancel(); }} className="p-2 hover:bg-neutral-100 rounded-full text-neutral-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-6 flex-1 max-h-[70vh] overflow-y-auto custom-scrollbar">
          
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-neutral-800 flex items-center gap-2">
                <Scissors className="w-4 h-4 text-neutral-400" /> Cắt đoạn
              </h4>
              <div className="text-xs text-neutral-500 bg-neutral-100 px-2 py-1 rounded">
                Gốc: {duration.toFixed(1)}s &rarr; Mới: {((endTime - startTime) / speed).toFixed(1)}s
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1 text-neutral-500">Từ (giây)</label>
                <input 
                  type="number" min={0} max={endTime} step={0.1}
                  value={startTime}
                  onChange={(e) => setStartTime(Math.min(Number(e.target.value), endTime))}
                  className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-neutral-500">Đến (giây)</label>
                <input 
                  type="number" min={startTime} max={duration} step={0.1}
                  value={endTime}
                  onChange={(e) => setEndTime(Math.max(startTime, Math.min(Number(e.target.value), duration)))}
                  className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none text-sm"
                />
              </div>
            </div>

            <div className="h-px bg-neutral-100 my-4" />

            <h4 className="font-semibold text-neutral-800 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-neutral-400" /> Tùy chỉnh âm thanh
            </h4>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-sm font-medium text-neutral-700">Tốc độ đọc</label>
                  <span className="text-sm text-neutral-500">{speed}x</span>
                </div>
                <input 
                  type="range" min={0.5} max={2.0} step={0.1} 
                  value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <div className="flex justify-between text-xs text-neutral-400 mt-1">
                  <span>Chậm</span><span>Bình thường</span><span>Nhanh</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-sm font-medium text-neutral-700">Âm lượng</label>
                  <span className="text-sm text-neutral-500">{Math.round(volume * 100)}%</span>
                </div>
                <input 
                  type="range" min={0} max={2.0} step={0.1} 
                  value={volume} onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <div className="flex justify-between text-xs text-neutral-400 mt-1">
                  <span>Im lặng</span><span>100%</span><span>200%</span>
                </div>
              </div>
            </div>
            
          </div>
        </div>

        <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex items-center gap-2 justify-between">
          <button onClick={resetSettings} className="p-2 hover:bg-neutral-200 text-neutral-600 rounded-lg transition-colors" title="Đặt lại gốc">
            <RotateCcw className="w-5 h-5" />
          </button>

          <div className="flex gap-2">
            {isPlaying ? (
              <button onClick={stopPreview} className="px-5 py-2.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded-xl font-medium transition-colors flex items-center gap-2">
                <Square className="w-4 h-4 fill-current" /> Dừng
              </button>
            ) : (
              <button disabled={isProcessing} onClick={handlePlayPreview} className="px-5 py-2.5 bg-white border border-neutral-200 hover:bg-neutral-50 disabled:opacity-50 text-neutral-800 rounded-xl font-medium transition-colors flex items-center gap-2 shadow-sm">
                <Play className="w-4 h-4 fill-current" /> Nghe thử
              </button>
            )}
            <button disabled={isProcessing} onClick={handleSave} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-medium transition-colors flex items-center gap-2 shadow-sm shadow-orange-500/20">
              <Save className="w-4 h-4" /> Áp dụng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
