import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import {
  appendChatMessagesForUser,
  clearChatHistoryForUser,
  getChatHistoryForUser,
  getOrCreateUser,
  getSubscriptionForUser,
  getWorkspaceForUser,
  upsertSubscriptionForUser,
  upsertWorkspaceForUser,
} from './src/db/users.ts';
import { optionalAuth, requireAuth } from './src/middleware/auth.ts';
import type { AuthRequest } from './src/middleware/auth.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '2mb' }));

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractGroundingSources(response: unknown): Array<{ title: string; uri: string }> {
  const resp = response as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
        }>;
      };
    }>;
  };
  const chunks = resp?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: Array<{ title: string; uri: string }> = [];
  for (const chunk of chunks) {
    const uri = chunk.web?.uri;
    const title = chunk.web?.title || uri;
    if (uri && (uri.startsWith('https://') || uri.startsWith('http://')) && !seen.has(uri)) {
      seen.add(uri);
      sources.push({ title: title ?? uri, uri });
    }
  }
  return sources;
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Load authenticated user's persisted Cloud SQL workspace, subscription, and chat history
app.get('/api/workspace', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userRecord = await getOrCreateUser(
      req.user!.uid,
      req.user!.email || 'operator@kooleriq.com',
      req.user!.name
    );
    const [workspace, subscription, chatHistory] = await Promise.all([
      getWorkspaceForUser(userRecord.id),
      getSubscriptionForUser(userRecord.id),
      getChatHistoryForUser(userRecord.id),
    ]);

    res.json({
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
      },
      workspace,
      subscription,
      chatHistory,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load workspace';
    res.status(500).json({ error: message });
  }
});

// Save authenticated user's cooler workspace state to PostgreSQL
app.put('/api/workspace', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { storeName, storeCode, doorsJson, catalogJson, insightsJson, auditsJson, settingsJson } =
      req.body ?? {};
    if (
      typeof storeName !== 'string' ||
      typeof storeCode !== 'string' ||
      !Array.isArray(doorsJson) ||
      typeof catalogJson !== 'object' ||
      !Array.isArray(insightsJson) ||
      !Array.isArray(auditsJson) ||
      typeof settingsJson !== 'object'
    ) {
      return res.status(400).json({ error: 'Invalid workspace payload.' });
    }

    const userRecord = await getOrCreateUser(
      req.user!.uid,
      req.user!.email || 'operator@kooleriq.com',
      req.user!.name
    );
    const saved = await upsertWorkspaceForUser(userRecord.id, {
      storeName: storeName.slice(0, 120),
      storeCode: storeCode.slice(0, 40),
      doorsJson,
      catalogJson,
      insightsJson,
      auditsJson,
      settingsJson,
    });

    res.json({ workspace: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save workspace';
    res.status(500).json({ error: message });
  }
});

// Persist pricing plan & Google Play subscription selection in PostgreSQL
app.put('/api/subscription', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { planTier, billingCycle, doorQuota, storeCount, googlePlayLinked } = req.body ?? {};
    const validTiers = new Set(['starter', 'pro', 'enterprise']);
    const validCycles = new Set(['monthly', 'annual']);

    if (!validTiers.has(planTier) || !validCycles.has(billingCycle)) {
      return res.status(400).json({ error: 'Invalid plan tier or billing cycle.' });
    }

    const parsedDoors = Math.max(1, Math.min(500, Number(doorQuota) || 2));
    const parsedStores = Math.max(1, Math.min(200, Number(storeCount) || 1));

    const userRecord = await getOrCreateUser(
      req.user!.uid,
      req.user!.email || 'operator@kooleriq.com',
      req.user!.name
    );
    const subscription = await upsertSubscriptionForUser(userRecord.id, {
      planTier,
      billingCycle,
      doorQuota: parsedDoors,
      storeCount: parsedStores,
      googlePlayLinked: Boolean(googlePlayLinked),
    });

    res.json({ subscription });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update subscription';
    res.status(500).json({ error: message });
  }
});

// Clear persisted chat messages
app.delete('/api/chat-history', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userRecord = await getOrCreateUser(
      req.user!.uid,
      req.user!.email || 'operator@kooleriq.com',
      req.user!.name
    );
    await clearChatHistoryForUser(userRecord.id);
    res.json({ cleared: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clear chat history';
    res.status(500).json({ error: message });
  }
});

// Multi-turn Gemini Merchandising Chatbot with optional Search Grounding
app.post('/api/ai/chat', optionalAuth, async (req: AuthRequest, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    return res.status(503).json({
      error: 'Gemini API key is not configured on the server. Set GEMINI_API_KEY in Settings > Secrets.',
    });
  }

  try {
    const { message, history, modelMode, useSearchGrounding, storeContext } = req.body ?? {};
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message text is required.' });
    }

    const trimmedMessage = message.trim().slice(0, 2000);
    const isFastMode = modelMode === 'fast';
    const selectedModel = isFastMode ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
    const enableSearch = !isFastMode && Boolean(useSearchGrounding);

    const sanitizedHistory = Array.isArray(history)
      ? history
          .slice(-16)
          .filter(
            (item): item is { role: 'user' | 'model'; content: string } =>
              item &&
              (item.role === 'user' || item.role === 'model') &&
              typeof item.content === 'string' &&
              item.content.trim().length > 0
          )
          .map((item) => ({
            role: item.role,
            parts: [{ text: item.content.slice(0, 3000) }],
          }))
      : [];

    const contextSummary =
      typeof storeContext === 'string' ? storeContext.slice(0, 2500) : 'No live cooler snapshot supplied.';

    const systemInstruction = [
      'You are KoolerIQ Copilot, an operational cold-chain retail merchandiser, planogram analyst, and route optimization advisor for convenience stores and gas stations (www.kooleriq.com).',
      'Be concise, data-driven, and practical for store managers and route drivers.',
      'Reference exact door numbers, shelf coordinates (e.g., S2-F05), temperatures, OOS gaps, and SKU pricing from the live store context when relevant.',
      'KoolerIQ also distributes its Android mobile app via Google Play with Starter ($0/mo, up to 2 doors), Pro Operator ($49/door/mo monthly or $39/door/mo annual), and Enterprise Fleet ($119/store/mo monthly or $95/store/mo annual) plans.',
      `Current live store cooler telemetry:\n${contextSummary}`,
    ].join('\n\n');

    const chat = ai.chats.create({
      model: selectedModel,
      config: {
        systemInstruction,
        ...(enableSearch ? { tools: [{ googleSearch: {} }] } : {}),
      },
      history: sanitizedHistory,
    });

    const response = await chat.sendMessage({ message: trimmedMessage });
    const replyText =
      response.text?.trim() || 'Unable to generate a response for that query. Please try again.';
    const sources = enableSearch ? extractGroundingSources(response) : [];

    // Persist turn to Cloud SQL if user is signed in
    if (req.user) {
      try {
        const userRecord = await getOrCreateUser(
          req.user.uid,
          req.user.email || 'operator@kooleriq.com',
          req.user.name
        );
        await appendChatMessagesForUser(userRecord.id, [
          {
            role: 'user',
            modelUsed: selectedModel,
            content: trimmedMessage,
          },
          {
            role: 'model',
            modelUsed: selectedModel,
            content: replyText,
            sourcesJson: sources,
          },
        ]);
      } catch (dbErr) {
        console.error('Non-fatal chat persistence error:', dbErr);
      }
    }

    res.json({
      reply: replyText,
      modelUsed: selectedModel,
      sources,
    });
  } catch (error) {
    console.error('Gemini chat error:', error);
    const msg = error instanceof Error ? error.message : 'Gemini chat request failed.';
    res.status(502).json({ error: msg });
  }
});

// Live Google Search Grounded Beverage & Convenience Store Market Intelligence
app.post('/api/ai/market-search', optionalAuth, async (req: AuthRequest, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    return res.status(503).json({
      error: 'Gemini API key is not configured on the server. Set GEMINI_API_KEY in Settings > Secrets.',
    });
  }

  try {
    const { query } = req.body ?? {};
    if (typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'Search query is required.' });
    }

    const prompt = `Provide an actionable convenience store beverage cooler merchandising briefing for: "${query
      .trim()
      .slice(0, 400)}". Include specific trending SKUs, category growth figures or seasonal drivers, and concrete shelf placement advice in 3-5 concise bullet points.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'You are a convenience store beverage category analyst for KoolerIQ (www.kooleriq.com). Use current web search results to provide accurate, factual retail beverage trends and shelf advice.',
        tools: [{ googleSearch: {} }],
      },
    });

    const summary = response.text?.trim() || 'No search-grounded results returned.';
    const sources = extractGroundingSources(response);

    res.json({
      summary,
      sources,
      modelUsed: 'gemini-4-hydrogen',
    });
  } catch (error) {
    console.error('Gemini search grounding error:', error);
    const msg = error instanceof Error ? error.message : 'Search grounding request failed.';
    res.status(502).json({ error: msg });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production build not found. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KoolerIQ server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
