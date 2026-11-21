import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_MALE_VOICES = new Set(['Charon', 'Fenrir', 'Orus', 'Puck']);
const TTS_CACHE_MAX = 24;
const ttsCache = new Map<string, { audioBase64: string; mimeType: string; voiceName: string }>();

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.post('/api/anchor-tts', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { text?: unknown; voiceName?: unknown };
    const rawText = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
    if (!rawText) {
      res.status(400).json({ error: 'Text is required for anchor speech.' });
      return;
    }

    const text = rawText.slice(0, 750);
    const requestedVoice = typeof body.voiceName === 'string' ? body.voiceName.trim() : 'Charon';
    const voiceName = ALLOWED_MALE_VOICES.has(requestedVoice) ? requestedVoice : 'Charon';
    const cacheKey = `${voiceName}:${text}`;

    const cached = ttsCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Server TTS key not configured.',
        fallbackToBrowser: true,
      });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text,
                speechMetadata: {
                  style:
                    'Warm, deep-voiced, authoritative Indian-English male financial TV news anchor delivering a crisp live stock exchange bulletin with clear, natural broadcast diction',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.[0];
      const base64Audio = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType || 'audio/wav';

      if (!base64Audio) {
        res.status(502).json({
          error: 'No audio returned from speech model.',
          fallbackToBrowser: true,
        });
        return;
      }

      const payload = { audioBase64: base64Audio, mimeType, voiceName };
      if (ttsCache.size >= TTS_CACHE_MAX) {
        const oldestKey = ttsCache.keys().next().value;
        if (oldestKey) ttsCache.delete(oldestKey);
      }
      ttsCache.set(cacheKey, payload);
      res.json(payload);
    } catch (err) {
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as { status?: unknown }).status) || 500
          : 500;
      res.status(status).json({
        error: 'Unable to synthesize studio audio at this moment.',
        fallbackToBrowser: true,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NWS Stock Exchange server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NWS Stock Exchange server:', err);
  process.exit(1);
});
