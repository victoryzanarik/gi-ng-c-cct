import React, { useState, useRef, useEffect } from 'react';
import { Play, Square, Loader2, Volume2, History, Settings, FileAudio, Download, Trash2, Mic, Layers, Edit3 } from 'lucide-react';
import { db, ConvertedFile, InputHistory } from '../lib/db';
import { getAudioDuration, encodeToMP3, downloadMp3, base64ToFloat32Array, mergeAudioFiles } from '../lib/audio';
import { AudioEditor } from './AudioEditor';
import { format } from 'date-fns';

interface VoiceOption {
  id: string;
  region: string;
  label: string;
}

export function TTSApp() {
  const [activeTab, setActiveTab] = useState<'create' | 'history' | 'settings'>('create');
  
  // Create Tab State
  const [text, setText] = useState('');
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('Bắc');
  const [voiceId, setVoiceId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Data State
  const [savedFiles, setSavedFiles] = useState<ConvertedFile[]>([]);
  const [inputHistory, setInputHistory] = useState<InputHistory[]>([]);
  
  // Audio Playback State
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Editor State
  const [editingFile, setEditingFile] = useState<ConvertedFile | null>(null);

  // Merge State
  const [isMerging, setIsMerging] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());

  // Preview State
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({});
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  useEffect(() => {
    loadVoices();
    loadData();
  }, []);

  const loadVoices = async () => {
    try {
      const res = await fetch('/api/voices');
      const data: VoiceOption[] = await res.json();
      setVoiceOptions(data);
      const savedVoice = localStorage.getItem('tts_default_voice');
      if (savedVoice && data.find(v => v.id === savedVoice)) {
        const region = data.find(v => v.id === savedVoice)?.region || 'Bắc';
        setSelectedRegion(region);
        setVoiceId(savedVoice);
      } else if (data.length > 0) {
        setVoiceId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePreviewVoice = async (vId: string, region: string) => {
    const previewId = `preview-${vId}`;
    if (playingId === previewId) {
      stopAudio();
      return;
    }

    if (previewCache[vId]) {
      playAudio(previewCache[vId], previewId);
      return;
    }

    setPreviewLoadingId(vId);
    try {
      let sampleText = "Xin chào, đây là giọng đọc thử.";
      if (region === 'Bắc') sampleText = "Chào bạn, mình là giọng đọc miền Bắc. Trải qua bao thăng trầm của thời gian, Hà Nội vẫn giữ trong mình vẻ đẹp cổ kính, bình yên và những nét văn hóa rất riêng.";
      else if (region === 'Trung') sampleText = "Chào bạn, mình là giọng đọc miền Trung. Đến với xứ Huế mộng mơ, bạn sẽ cảm nhận được sự bình yên, thư thái qua từng nhịp sống chậm rãi và con người hiền hòa.";
      else if (region === 'Nam') sampleText = "Chào bạn, mình là giọng đọc miền Nam. Sài Gòn lúc nào cũng nhộn nhịp, năng động, con người ở đây thì vô cùng hào sảng, nhiệt tình và chân chất.";

      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sampleText, voiceId: vId }),
      });
      const data = await response.json();
      if (data.audio) {
        setPreviewCache(prev => ({ ...prev, [vId]: data.audio }));
        playAudio(data.audio, previewId);
      }
    } catch (e) {
      console.error("Preview error:", e);
      alert("Không thể tải âm thanh nghe thử lúc này.");
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const loadData = async () => {
    setSavedFiles(await db.getConvertedFiles());
    setInputHistory(await db.getInputHistory());
  };

  const handleCreate = async () => {
    if (!text.trim() || !voiceId) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId }),
      });

      if (!response.ok) throw new Error('Failed to fetch audio');

      const data = await response.json();
      if (data.audio) {
        const duration = getAudioDuration(data.audio);
        const newFile: ConvertedFile = {
          id: Date.now().toString(),
          text,
          voiceId,
          audioBase64: data.audio,
          timestamp: Date.now(),
          duration
        };
        
        await db.saveConvertedFile(newFile);
        await db.saveInputHistory({ id: Date.now().toString(), text, timestamp: Date.now() });
        await loadData();
        
        // Auto play the newly created audio
        playAudio(data.audio, newFile.id);
      }
    } catch (error) {
      console.error(error);
      alert('Có lỗi xảy ra khi tạo giọng nói. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const playAudio = (base64Audio: string, id: string) => {
    stopAudio();

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    audioContextRef.current = ctx;

    const float32Data = base64ToFloat32Array(base64Audio);
    const buffer = ctx.createBuffer(1, float32Data.length, 24000);
    buffer.getChannelData(0).set(float32Data);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    
    source.onended = () => {
      setPlayingId(null);
      audioSourceRef.current = null;
    };

    source.start();
    audioSourceRef.current = source;
    setPlayingId(id);
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch(e){}
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setPlayingId(null);
  };

  const handleDeleteFile = async (id: string) => {
    await db.deleteConvertedFile(id);
    if (playingId === id) stopAudio();
    if (selectedForMerge.has(id)) {
      const newSet = new Set(selectedForMerge);
      newSet.delete(id);
      setSelectedForMerge(newSet);
    }
    loadData();
  };

  const handleDownload = (base64: string, filename: string) => {
    const float32 = base64ToFloat32Array(base64);
    const mp3Blob = encodeToMP3(float32);
    downloadMp3(mp3Blob, `${filename}.mp3`);
  };

  const handleSaveEdit = async (newBase64: string, newDuration: number) => {
    if (editingFile) {
      await db.updateConvertedFile(editingFile.id, newBase64, newDuration);
      await loadData();
    }
    setEditingFile(null);
  };

  const handleToggleMergeSelection = (id: string) => {
    const newSet = new Set(selectedForMerge);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedForMerge(newSet);
  };

  const executeMerge = async () => {
    if (selectedForMerge.size < 2) return;
    
    const filesToMerge = savedFiles.filter(f => selectedForMerge.has(f.id));
    // Sort chronologically by timestamp
    filesToMerge.sort((a, b) => a.timestamp - b.timestamp);
    
    const base64List = filesToMerge.map(f => f.audioBase64);
    const mergedBase64 = mergeAudioFiles(base64List);
    const mergedDuration = getAudioDuration(mergedBase64);
    
    const newFile: ConvertedFile = {
      id: Date.now().toString(),
      text: "[Đã nối] " + filesToMerge.map(f => f.text).join(" ... "),
      voiceId: 'mixed',
      audioBase64: mergedBase64,
      timestamp: Date.now(),
      duration: mergedDuration
    };
    
    await db.saveConvertedFile(newFile);
    await loadData();
    setSelectedForMerge(new Set());
    setIsMerging(false);
  };

  const regions = ['Bắc', 'Trung', 'Nam'];
  const currentRegionVoices = voiceOptions.filter(v => v.region === selectedRegion);

  const getVoiceLabel = (vId: string) => {
    if (vId === 'mixed') return 'Nhiều giọng (Nối)';
    const v = voiceOptions.find(opt => opt.id === vId);
    return v ? `${v.region} - ${v.label}` : 'Khác';
  }

  const renderTabs = () => (
    <div className="flex gap-2 overflow-x-auto pb-2 border-b border-neutral-100 mb-6 custom-scrollbar">
      {[
        { id: 'create', icon: Mic, label: 'Studio' },
        { id: 'history', icon: History, label: 'Lịch Sử' },
        { id: 'settings', icon: Settings, label: 'Cài Đặt' }
      ].map(tab => (
        <button
          key={tab.id}
          onClick={() => { setActiveTab(tab.id as any); stopAudio(); }}
          className={`flex items-center gap-2 px-5 py-3 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === tab.id 
              ? 'bg-blue-50 text-blue-600 border border-blue-100' 
              : 'text-neutral-500 hover:bg-neutral-50 border border-transparent'
          }`}
        >
          <tab.icon className="w-4 h-4" />
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] flex justify-center p-4 font-sans text-neutral-800">
      <div className="max-w-4xl w-full bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden border border-neutral-100 min-h-[800px] flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm mb-4">
            <Volume2 className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">ProVoice VN</h1>
          <p className="text-blue-100 max-w-lg mx-auto">
            Hệ thống tổng hợp giọng nói tự nhiên, đa vùng miền chuyên nghiệp.
          </p>
        </div>

        <div className="p-6 md:p-8 flex-1 flex flex-col">
          {renderTabs()}

          {activeTab === 'create' && (
            <div className="flex-1 flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              {/* Voice Selector */}
              <div className="bg-neutral-50 p-5 rounded-2xl border border-neutral-100">
                <div className="flex gap-2 mb-4">
                  {regions.map(r => (
                    <button 
                      key={r} 
                      onClick={() => {
                        setSelectedRegion(r);
                        const firstVoiceInRegion = voiceOptions.find(v => v.region === r);
                        if (firstVoiceInRegion) setVoiceId(firstVoiceInRegion.id);
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        selectedRegion === r ? 'bg-blue-600 text-white shadow' : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-blue-50'
                      }`}
                    >
                      Miền {r}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {currentRegionVoices.map(v => (
                    <div 
                      key={v.id} 
                      onClick={() => setVoiceId(v.id)}
                      className={`flex items-center justify-between p-2 pl-3 rounded-xl border transition-all cursor-pointer ${
                        voiceId === v.id 
                          ? 'bg-blue-50 border-blue-400 shadow-sm ring-1 ring-blue-400' 
                          : 'bg-white border-neutral-200 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      <span className={`text-sm font-medium ${voiceId === v.id ? 'text-blue-800' : 'text-neutral-700'}`}>
                        {v.label}
                      </span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handlePreviewVoice(v.id, v.region); }}
                        disabled={previewLoadingId === v.id}
                        className={`p-2 rounded-full transition-colors ${
                          playingId === `preview-${v.id}` 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                        }`}
                        title="Nghe thử giọng mẫu"
                      >
                        {previewLoadingId === v.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : playingId === `preview-${v.id}` ? (
                          <Square className="w-4 h-4 fill-current" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Text Input */}
              <div className="flex flex-col relative min-h-[200px]">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Nhập văn bản vào đây để AI đọc (Hỗ trợ ngữ điệu tự nhiên)..."
                  className="w-full flex-1 p-5 bg-white border border-neutral-200 rounded-2xl text-lg resize-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all outline-none shadow-inner"
                  disabled={isLoading}
                />
                <div className="absolute bottom-4 right-4 text-sm text-neutral-400 font-medium">
                  {text.length} ký tự
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-center">
                <button 
                  onClick={handleCreate} 
                  disabled={isLoading || !text.trim()} 
                  className="flex items-center gap-2 px-10 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-200 disabled:text-neutral-400 text-white rounded-full font-bold transition-all text-lg active:scale-[0.98] shadow-lg shadow-blue-600/20"
                >
                  {isLoading ? (
                    <><Loader2 className="w-6 h-6 animate-spin" /> Đang Xử Lý...</>
                  ) : (
                    <><Play className="w-6 h-6 fill-current" /> Tạo & Nghe thử</>
                  )}
                </button>
              </div>

              {/* Saved Files Section Inline */}
              <div className="pt-8 border-t border-neutral-100 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-neutral-800 flex items-center gap-2">
                    <FileAudio className="w-5 h-5 text-blue-500" /> Bản thu gần đây
                  </h3>
                  <button 
                    onClick={() => {
                      setIsMerging(!isMerging);
                      if (isMerging) setSelectedForMerge(new Set());
                    }}
                    className={`text-sm font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${isMerging ? 'bg-neutral-200 text-neutral-700' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                  >
                    <Layers className="w-4 h-4" /> {isMerging ? 'Hủy nối' : 'Nối file'}
                  </button>
                </div>
                
                {isMerging && selectedForMerge.size > 0 && (
                  <div className="bg-indigo-50 p-3 rounded-xl mb-4 border border-indigo-100 flex items-center justify-between">
                    <span className="text-sm font-medium text-indigo-800">Đã chọn {selectedForMerge.size} file để nối</span>
                    <button onClick={executeMerge} disabled={selectedForMerge.size < 2} className="bg-indigo-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors">
                      Thực hiện nối
                    </button>
                  </div>
                )}

                <div className="space-y-3">
                  {savedFiles.length === 0 ? (
                    <div className="text-center text-neutral-400 py-8 bg-neutral-50 rounded-2xl border border-dashed border-neutral-200">Chưa có bản thu nào.</div>
                  ) : (
                    savedFiles.slice(0, 10).map(file => (
                      <div key={file.id} className={`bg-white border rounded-2xl p-4 shadow-sm flex flex-col gap-3 transition-all ${isMerging && selectedForMerge.has(file.id) ? 'border-indigo-400 ring-2 ring-indigo-50 bg-indigo-50/30' : 'border-neutral-200 hover:border-blue-200 hover:shadow-md'}`}>
                        <div className="flex justify-between items-start gap-4">
                          {isMerging && (
                            <input 
                              type="checkbox" 
                              checked={selectedForMerge.has(file.id)}
                              onChange={() => handleToggleMergeSelection(file.id)}
                              className="mt-1 w-5 h-5 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-neutral-900 font-medium line-clamp-2 leading-relaxed">{file.text}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs font-medium">
                              <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md border border-blue-100">{getVoiceLabel(file.voiceId)}</span>
                              <span className="text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-md">{file.duration.toFixed(1)}s</span>
                              <span className="text-neutral-400 ml-auto">{format(file.timestamp, 'HH:mm - dd/MM/yyyy')}</span>
                            </div>
                          </div>
                          <button 
                            onClick={() => playingId === file.id ? stopAudio() : playAudio(file.audioBase64, file.id)}
                            className={`p-3 rounded-full flex-shrink-0 transition-colors ${playingId === file.id ? 'bg-neutral-900 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                          >
                            {playingId === file.id ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                          </button>
                        </div>
                        {!isMerging && (
                          <div className="flex gap-2 pt-2 border-t border-neutral-100 mt-1">
                            <button onClick={() => setEditingFile(file)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">
                              <Edit3 className="w-4 h-4" /> Edit
                            </button>
                            <button onClick={() => handleDownload(file.audioBase64, `ProVoice-${file.id}`)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">
                              <Download className="w-4 h-4" /> MP3
                            </button>
                            <button onClick={() => handleDeleteFile(file.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-auto">
                              <Trash2 className="w-4 h-4" /> Xóa
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="flex-1 overflow-y-auto space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
               {inputHistory.length === 0 ? (
                <div className="text-center text-neutral-400 py-12">Chưa có lịch sử nhập liệu.</div>
              ) : (
                inputHistory.map(item => (
                  <div key={item.id} className="group bg-neutral-50 hover:bg-white hover:shadow-sm border border-transparent hover:border-neutral-200 rounded-xl p-4 transition-all cursor-pointer" onClick={() => { setText(item.text); setActiveTab('create'); }}>
                    <p className="text-sm text-neutral-700 line-clamp-2">{item.text}</p>
                    <div className="text-xs text-neutral-400 mt-2">{format(item.timestamp, 'HH:mm - dd/MM/yyyy')}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200">
                <h3 className="text-base font-semibold mb-4 text-neutral-800">Cài đặt chung</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-2">Giọng mặc định</label>
                    <select 
                      value={voiceId}
                      onChange={(e) => {
                        setVoiceId(e.target.value);
                        localStorage.setItem('tts_default_voice', e.target.value);
                      }}
                      className="w-full p-3 bg-white border border-neutral-200 rounded-xl outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 text-sm font-medium"
                    >
                      {voiceOptions.map(v => <option key={v.id} value={v.id}>{v.region} - {v.label}</option>)}
                    </select>
                  </div>
                  <div className="pt-4 border-t border-neutral-200">
                     <button onClick={async () => { await db.clearInputHistory(); loadData(); }} className="text-sm text-red-500 font-medium hover:underline">
                       Xóa toàn bộ lịch sử nhập liệu
                     </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {editingFile && (
        <AudioEditor
          audioBase64={editingFile.audioBase64}
          onSave={handleSaveEdit}
          onCancel={() => setEditingFile(null)}
        />
      )}
    </div>
  );
}
