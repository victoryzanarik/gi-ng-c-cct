import { get, set, update } from 'idb-keyval';

export interface ConvertedFile {
  id: string;
  text: string;
  voiceId: string;
  audioBase64: string;
  timestamp: number;
  duration: number; // in seconds
}

export interface InputHistory {
  id: string;
  text: string;
  timestamp: number;
}

export const db = {
  async saveConvertedFile(file: ConvertedFile) {
    await update('converted_files', (val: ConvertedFile[] = []) => [file, ...val]);
  },
  async getConvertedFiles(): Promise<ConvertedFile[]> {
    return (await get('converted_files')) || [];
  },
  async updateConvertedFile(id: string, newAudioBase64: string, newDuration: number) {
    await update('converted_files', (val: ConvertedFile[] = []) => 
      val.map(f => f.id === id ? { ...f, audioBase64: newAudioBase64, duration: newDuration } : f)
    );
  },
  async deleteConvertedFile(id: string) {
    await update('converted_files', (val: ConvertedFile[] = []) => val.filter(f => f.id !== id));
  },
  async saveInputHistory(history: InputHistory) {
    await update('input_history', (val: InputHistory[] = []) => {
      // Avoid duplicate exact text, move to top
      const updated = [history, ...val.filter(h => h.text !== history.text)];
      return updated.slice(0, 50); // Keep last 50
    });
  },
  async getInputHistory(): Promise<InputHistory[]> {
    return (await get('input_history')) || [];
  },
  async clearInputHistory() {
    await set('input_history', []);
  }
};
