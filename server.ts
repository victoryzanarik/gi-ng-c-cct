import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const voiceProfiles: Record<string, { voice: string, region: string, label: string, prompt: string }> = {
  // Miền Bắc
  'bac_nam_tre': { voice: 'Fenrir', region: 'Bắc', label: 'Nam Trẻ - Tự nhiên', prompt: 'giọng nam thanh niên người miền Bắc (Hà Nội), nói chuyện rất tự nhiên, linh hoạt, đời thường, gần gũi như đang tâm sự' },
  'bac_nu_tre': { voice: 'Kore', region: 'Bắc', label: 'Nữ Trẻ - Nhẹ nhàng', prompt: 'giọng nữ thanh niên người miền Bắc (Hà Nội), nhẹ nhàng, dễ thương, giao tiếp đời thường, tự nhiên' },
  'bac_nam_thoisu': { voice: 'Charon', region: 'Bắc', label: 'Nam - Thời sự / MC', prompt: 'giọng nam người miền Bắc, chuẩn giọng đài truyền hình, chuyên nghiệp, rõ ràng, dứt khoát' },
  'bac_nu_thoisu': { voice: 'Kore', region: 'Bắc', label: 'Nữ - Thời sự / MC', prompt: 'giọng nữ người miền Bắc, chuẩn giọng thời sự, chuyên nghiệp, mạch lạc, tròn vành rõ chữ' },
  'bac_nam_kechuyen': { voice: 'Charon', region: 'Bắc', label: 'Nam - Kể chuyện', prompt: 'giọng nam miền Bắc trầm ấm, vang, đọc truyện đêm khuya hoặc kể chuyện lôi cuốn, diễn cảm' },
  'bac_nu_kechuyen': { voice: 'Zephyr', region: 'Bắc', label: 'Nữ - Kể chuyện', prompt: 'giọng nữ miền Bắc truyền cảm, ấm áp, kể chuyện ru ngủ hoặc tâm tình sâu lắng' },
  'bac_nam_soidong': { voice: 'Puck', region: 'Bắc', label: 'Nam - Reviewer', prompt: 'giọng nam miền Bắc năng động, nhịp độ nhanh, linh hoạt, phù hợp làm video review hoặc TikTok' },
  'bac_nu_soidong': { voice: 'Puck', region: 'Bắc', label: 'Nữ - Reviewer', prompt: 'giọng nữ miền Bắc tươi trẻ, năng lượng cao, nhí nhảnh, diễn cảm cao để làm video ngắn' },
  'bac_ong_lao': { voice: 'Charon', region: 'Bắc', label: 'Ông Lão', prompt: 'giọng ông cụ người miền Bắc lớn tuổi, chậm rãi, khàn nhẹ, hiền từ và trải đời' },
  'bac_ba_lao': { voice: 'Zephyr', region: 'Bắc', label: 'Bà Lão', prompt: 'giọng bà cụ người miền Bắc, mộc mạc, từ tốn, ấm áp như bà kể chuyện cho cháu' },
  
  // Miền Trung
  'trung_nam_hue': { voice: 'Fenrir', region: 'Trung', label: 'Nam - Huế mộng mơ', prompt: 'giọng nam người Huế, mang âm sắc Huế đặc trưng, nhẹ nhàng, tự nhiên và tình cảm' },
  'trung_nu_hue': { voice: 'Kore', region: 'Trung', label: 'Nữ - Huế dịu dàng', prompt: 'giọng nữ người Huế, dịu dàng, ngọt ngào, phát âm mang đậm nét văn hóa cố đô' },
  'trung_nam_danang': { voice: 'Fenrir', region: 'Trung', label: 'Nam - Đà Nẵng', prompt: 'giọng nam thanh niên người Đà Nẵng, khỏe khoắn, tự nhiên, rành rọt, gần gũi' },
  'trung_nu_danang': { voice: 'Kore', region: 'Trung', label: 'Nữ - Đà Nẵng', prompt: 'giọng nữ người Đà Nẵng, thân thiện, đời thường, vui vẻ và tự nhiên' },
  'trung_nam_nghean': { voice: 'Charon', region: 'Trung', label: 'Nam - Nghệ An', prompt: 'giọng nam người Nghệ An (xứ Nghệ), trầm, mộc mạc, mạnh mẽ, đặc trưng tiếng địa phương' },
  'trung_nu_nghean': { voice: 'Zephyr', region: 'Trung', label: 'Nữ - Nghệ An', prompt: 'giọng nữ người Nghệ An, chất phác, thật thà, âm điệu địa phương mộc mạc' },
  'trung_me_hue': { voice: 'Zephyr', region: 'Trung', label: 'Mệ Huế (Bà lão)', prompt: 'giọng bà cụ (mệ) người Huế lớn tuổi, chậm rãi, ấm áp, từ tốn, đậm chất Huế xưa' },
  'trung_ong_hue': { voice: 'Charon', region: 'Trung', label: 'Ông cụ Huế', prompt: 'giọng ông cụ người Huế, thâm trầm, vang và từng trải' },

  // Miền Nam
  'nam_nam_tre': { voice: 'Fenrir', region: 'Nam', label: 'Nam Trẻ - Phóng khoáng', prompt: 'giọng nam thanh niên người Sài Gòn (miền Nam), nói chuyện phóng khoáng, cực kỳ tự nhiên, đời thường' },
  'nam_nu_tre': { voice: 'Kore', region: 'Nam', label: 'Nữ Trẻ - Dễ thương', prompt: 'giọng nữ thanh niên Sài Gòn, ngọt ngào, dễ thương, nói chuyện như bạn bè đời thường' },
  'nam_nam_thuyetminh': { voice: 'Charon', region: 'Nam', label: 'Nam - Thuyết minh phim', prompt: 'giọng nam người miền Nam, điềm đạm, chuẩn giọng thuyết minh phim truyền hình kinh điển' },
  'nam_nu_thuyetminh': { voice: 'Zephyr', region: 'Nam', label: 'Nữ - Thuyết minh phim', prompt: 'giọng nữ người miền Nam, diễn cảm, truyền cảm, lồng tiếng phim tình cảm' },
  'nam_nam_review': { voice: 'Puck', region: 'Nam', label: 'Nam - Tiktoker', prompt: 'giọng nam miền Nam năng động, nói nhanh, linh hoạt, hào hứng, phong cách YouTuber/TikToker' },
  'nam_nu_review': { voice: 'Puck', region: 'Nam', label: 'Nữ - Tiktoker', prompt: 'giọng nữ miền Nam lanh lợi, nhí nhảnh, bắt trend, phong cách review ẩm thực năng động' },
  'nam_ong_lao': { voice: 'Charon', region: 'Nam', label: 'Ông Lão Nam Bộ', prompt: 'giọng ông cụ người miền Nam (Nam Bộ), hào sảng, chân chất, lớn tuổi, gần gũi' },
  'nam_ba_lao': { voice: 'Zephyr', region: 'Nam', label: 'Bà Lão Nam Bộ', prompt: 'giọng bà cụ người miền Nam, hiền hậu, nói chuyện rề rà, mộc mạc, chất phác' },
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/voices", (req, res) => {
    // Expose voice profiles to the client
    const voices = Object.entries(voiceProfiles).map(([id, profile]) => ({
      id,
      region: profile.region,
      label: profile.label
    }));
    res.json(voices);
  });

  app.post("/api/tts", async (req, res) => {
    try {
      const { text, voiceId = 'bac_nu_tre' } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const profile = voiceProfiles[voiceId] || voiceProfiles['bac_nu_tre'];
      const prompt = `Speak the following text in Vietnamese with a high level of naturalness and emotion. Act precisely as this persona: "${profile.prompt}". The delivery should sound like a real human speaking in everyday life, not a robot. Text to read: "${text}"`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: profile.voice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (base64Audio) {
        res.json({ audio: base64Audio });
      } else {
        res.status(500).json({ error: "Failed to generate audio" });
      }
    } catch (error) {
      console.error("TTS generation error:", error);
      res.status(500).json({ error: "An error occurred while generating speech." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
