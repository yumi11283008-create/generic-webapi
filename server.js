const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static('public'));

// 設定をコードで定義
const PROVIDER = 'openai';  // 'openai' or 'gemini'
const MODEL = 'gpt-5.2';  // OpenAI: 'gpt-4o-mini', Gemini: 'gemini-2.5-flash'

let promptTemplate;
try {
    promptTemplate = fs.readFileSync('prompt.md', 'utf8');
} catch (error) {
    console.error('Error reading prompt.md:', error);
    process.exit(1);
}

// 以下のコメントアウトは授業外でOPENAI使いたいとき用
// const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_API_ENDPOINT = "https://openai-api-proxy-746164391621.us-west1.run.app";
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

// --- ここから追加 ---

// キャラクターのリスト
const characters = {
    emilia: 'エミリア・サンドラ',
    oliver: 'オリバー・ハワード',
    lucy: 'ルーシー・グレイ'
};

app.post('/api/chat', async (req, res) => {
    try {
        const { message, characterId, history } = req.body;

        // 選択されたキャラクター名を取得
        const character = characters[characterId];
        if (!character) {
            return res.status(400).json({ error: '指定された登場人物が見つかりません。' });
        }

        // 会話履歴を文字列に変換
        const historyText = (history || [])
            .map(h => `${h.role === 'user' ? '探偵' : character}: ${h.parts[0].text}`)
            .join('\n');

        // prompt.mdのテンプレート変数を置換
        let finalPrompt = promptTemplate
            .replace(/\$\{character\}/g, character)
            .replace(/\$\{message\}/g, message)
            .replace(/\$\{history\}/g, historyText);

        let result;
        if (PROVIDER === 'openai') {
            // OpenAIの呼び出しロジックをここに実装（今回はcallOpenAIChatを想定）
            result = await callOpenAIChat(finalPrompt);
        } else if (PROVIDER === 'gemini') {
            // Geminiの呼び出しロジックをここに実装（今回はcallGeminiChatを想定）
            result = await callGeminiChat(finalPrompt);
        } else {
            return res.status(400).json({ error: 'Invalid provider configuration' });
        }

        res.json(result); // AIからの応答は既にJSON形式のはずなのでそのまま返す

    } catch (error) {
        console.error('Chat API Error:', error);
        res.status(500).json({ error: error.message });
    }
});
// --- ここまで追加 ---

app.post('/api/', async (req, res) => {
    try {
        const { prompt, title = 'Generated Content', ...variables } = req.body;

        // prompt.mdのテンプレート変数を自動置換
        let finalPrompt = prompt || promptTemplate;
        
        // リクエストボディの全てのキーを変数として利用
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
            finalPrompt = finalPrompt.replace(regex, value);
        }

        let result;
        if (PROVIDER === 'openai') {
            result = await callOpenAI(finalPrompt);
        } else if (PROVIDER === 'gemini') {
            result = await callGemini(finalPrompt);
        } else {
            return res.status(400).json({ error: 'Invalid provider configuration' });
        }

        res.json({ 
            title: title,
            data: result 
        });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

async function callOpenAI(prompt) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    const response = await fetch(OPENAI_API_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: prompt }
            ],
            max_completion_tokens: 2000,
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content;
    
    try {
        const parsedData = JSON.parse(responseText);
        // Find the first value in the object that is an array
        const arrayData = Object.values(parsedData).find(Array.isArray);
        if (!arrayData) {
            throw new Error('No array found in the LLM response object.');
        }
        return arrayData;
    } catch (parseError) {
        throw new Error('Failed to parse LLM response: ' + parseError.message);
    }
}

// --- ここから追加 ---
async function callOpenAIChat(prompt) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

    const response = await fetch(OPENAI_API_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [{ role: 'system', content: prompt }],
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content;
    try {
        return JSON.parse(responseText);
    } catch (parseError) {
        throw new Error('Failed to parse LLM response: ' + responseText);
    }
}
// --- ここまで追加 ---

async function callGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not set');
    }

    const response = await fetch(`${GEMINI_API_BASE_URL}${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                maxOutputTokens: 3000,
                response_mime_type: "application/json"
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Gemini API error');
    }

    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;
    
    try {
        const parsedData = JSON.parse(responseText);
        // Find the first value in the object that is an array
        const arrayData = Object.values(parsedData).find(Array.isArray);
        if (!arrayData) {
            throw new Error('No array found in the LLM response object.');
        }
        return arrayData;
    } catch (parseError) {
        throw new Error('Failed to parse LLM response: ' + parseError.message);
    }
}

// --- ここから追加 ---
async function callGeminiChat(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

    const response = await fetch(`${GEMINI_API_BASE_URL}${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                response_mime_type: "application/json"
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Gemini API error');
    }

    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;
    try {
        return JSON.parse(responseText);
    } catch (parseError) {
        throw new Error('Failed to parse LLM response: ' + responseText);
    }
}
// --- ここまで追加 ---

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Config: ${PROVIDER} - ${MODEL}`);
});