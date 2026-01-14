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
let finalDeductionPromptTemplate;
try {
    promptTemplate = fs.readFileSync('prompt.md', 'utf8');
    finalDeductionPromptTemplate = fs.readFileSync('final-deduction-prompt.md', 'utf8');
} catch (error) {
    if (error.path === 'prompt.md') {
        console.error('Error reading prompt.md:', error);
        process.exit(1);
    } else if (error.path === 'final-deduction-prompt.md') {
        console.error('Error reading final-deduction-prompt.md:', error);
        process.exit(1);
    }
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

// --- 気象情報API関連 ---
// 天気コードを日本語の簡単な説明に変換するヘルパー関数
function getWeatherDescription(weathercode) {
    if (weathercode === 0) return '晴れ';
    if (weathercode >= 1 && weathercode <= 3) return '曇り';
    if (weathercode >= 45 && weathercode <= 48) return '霧';
    if (weathercode >= 51 && weathercode <= 67) return '雨';
    if (weathercode >= 71 && weathercode <= 77) return '雪';
    if (weathercode >= 80 && weathercode <= 82) return 'にわか雨';
    if (weathercode >= 95 && weathercode <= 99) return '雷雨';
    return '不明'; // どれにも当てはまらない場合
}

async function getCurrentWeather() {
    try {
        // Open-Meteo APIで東京の現在の天気、気温、湿度を取得
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=35.6895&longitude=139.6917&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m');
        const data = await response.json();

        // デバッグ用にAPIからの応答をコンソールに出力
        console.log('Weather API Response:', JSON.stringify(data, null, 2));

        // APIからの応答に 'current' が含まれているかチェック
        if (!data || !data.current) {
            console.warn('気象情報APIから期待した形式のデータが返されませんでした。');
            return null; // エラーを投げる代わりにnullを返す
        }

        const weather = data.current; // data.current が存在することを確認してから代入
        const weatherDescription = getWeatherDescription(weather.weather_code);
        const temperature = weather.temperature_2m;
        const humidity = weather.relative_humidity_2m;
        const windSpeed = weather.wind_speed_10m;
        // APIの単位はkm/h
        return `天気は「${weatherDescription}」、気温は${temperature}度、湿度は${humidity}%、風速は${windSpeed}km/h`;
    } catch (error) {
        console.error('気象情報APIの取得に失敗しました:', error);
        return null; // エラーの場合はnullを返す
    }
}

app.post('/api/chat', async (req, res) => {
    try {
        const { message, characterId, history } = req.body;

        // ユーザーの発言とAIの応答で1ターン。ユーザーの20回目の発言が来たら最終ターン。
        // historyには過去のやり取りが入っているので、長さが 19 * 2 = 38 の時に最終ターンフラグを立てる
        const isFinalTurn = (history || []).length >= 38;

        // 選択されたキャラクター名を取得
        const character = characters[characterId];
        if (!character) {
            return res.status(400).json({ error: '指定された登場人物が見つかりません。' });
        }

        // --- 気象情報を取得してプロンプトに追加 ---
        const weather = await getCurrentWeather();
        const weatherText = weather ? `現在の外の状況は${weather}です。` : ''; // フレーバー程度に調整
        // --- ここまで ---

        // 会話履歴を文字列に変換
        const historyText = (history || [])
            .map(h => `${h.role === 'user' ? '探偵' : character}: ${h.parts[0].text}`)
            .join('\n');

        // prompt.mdのテンプレート変数を置換
        let finalPrompt = promptTemplate.replace(/\$\{weather_info\}/g, weatherText)
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

        // AIからの応答に最終ターンかどうかの情報を含めて返す
        res.json({ ...result, isFinalTurn });

    } catch (error) {
        console.error('Chat API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/final-deduction', async (req, res) => {
    try {
        const { characterId, reasoning, histories } = req.body;

        const suspect = characters[characterId];
        if (!suspect) {
            return res.status(400).json({ error: '指定された登場人物が見つかりません。' });
        }

        // 物語の文脈（最初のプロンプト）を取得
        const promptParts = promptTemplate.split(/###\s*.*/);
        const storyContext = promptParts[0]; // 全体設定

        // 容疑者（suspect）のキャラクター設定をprompt.mdからより柔軟に抽出する
        const characterSettingsRegex = new RegExp(`###.*?${suspect}[\\s\\S]*?\\n([\\s\\S]*?)(?=###|$)`);
        const match = promptTemplate.match(characterSettingsRegex);
        const characterSettings = match ? match[1].trim() : '';
        if (!characterSettings) {
            console.warn(`Warning: Could not find character settings for ${suspect} in prompt.md`);
        }

        // 指名された容疑者との会話履歴のみを整形して文字列にする
        const suspectHistory = histories[characterId] || [];
        const historyText = suspectHistory
            .map(h => `${h.role === 'user' ? '探偵' : suspect}: ${h.parts[0].text}`)
            .join('\n');

        // 最終推理用のプロンプトに変数を埋め込む
        let finalPrompt = finalDeductionPromptTemplate
            .replace(/\$\{story_context\}/g, storyContext)
            .replace(/\$\{character_settings\}/g, characterSettings) // キャラクター設定を追加
            .replace(/\$\{suspect\}/g, suspect)
            .replace(/\$\{trick\}/g, reasoning)
            .replace(/\$\{history\}/g, historyText); // 容疑者との会話履歴を追加

        let result;
        if (PROVIDER === 'openai') {
            result = await callOpenAIChat(finalPrompt, true); // JSON形式として解析する
        } else if (PROVIDER === 'gemini') {
            result = await callGeminiChat(finalPrompt, true); // JSON形式として解析する
        } else {
            return res.status(400).json({ error: 'Invalid provider configuration' });
        }

        // isCorrectフラグとAIの応答をクライアントに返す
        const isCorrect = suspect === 'エミリア・サンドラ'; // 正解の犯人を設定
        res.json({
            isCorrect: isCorrect,
            response: result.reply // AIの応答テキストを抽出
        });

    } catch (error) {
        console.error('Final Deduction API Error:', error);
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
async function callOpenAIChat(prompt, parseAsJson = true) {
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
            ...(parseAsJson && { response_format: { type: "json_object" } }) // parseAsJsonがtrueの場合のみ適用
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content;
    
    if (parseAsJson) {
        try {
            return JSON.parse(responseText);
        } catch (parseError) {
            throw new Error('Failed to parse LLM response: ' + responseText);
        }
    }
    return { reply: responseText }; // parseAsJsonがfalseの場合は、テキストをそのままreplyとして返す
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
async function callGeminiChat(prompt, parseAsJson = true) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

    const response = await fetch(`${GEMINI_API_BASE_URL}${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            ...(parseAsJson && { generationConfig: {
                response_mime_type: "application/json"
            }})
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Gemini API error');
    }

    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;
    
    if (parseAsJson) {
        try {
            return JSON.parse(responseText);
        } catch (parseError) {
            throw new Error('Failed to parse LLM response: ' + responseText);
        }
    }
    return { reply: responseText }; // parseAsJsonがfalseの場合は、テキストをそのままreplyとして返す
}
// --- ここまで追加 ---

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Config: ${PROVIDER} - ${MODEL}`);
});