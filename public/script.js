// DOMが読み込まれたら実行
document.addEventListener('DOMContentLoaded', () => {
    // =================================================
    // ▼▼▼ タイトル画面の処理 ▼▼▼
    // =================================================
    const titleScreen = document.getElementById('title-screen');
    const gameScreen = document.getElementById('game-screen');
    const titleLogo = document.getElementById('title-logo');
    const startText = document.getElementById('start-text');
    const introductionContainer = document.getElementById('introduction-container');
    const introductionText = document.getElementById('introduction-text');

    // 導入文（あらまし）
    const story = `<b>あらまし</b><br>あなたは探偵だ。あなたは知人のリチャード・サンドラという大富豪から彼が開くパーティーに招待される。<br>
                        あなたは彼の所有する森の中の邸宅で<font color="red"><b>22時まで</b></font>パーティーに参加した。<br>
                        その後、夜も更けてきたため彼の邸宅に泊めてもらう流れになる。<br>
                        しかし、<font color="red"><b>22:55</b></font>にリチャードの妻エミリアの悲鳴で眼を覚ます。<br>
                        なんと彼は彼の自室で遺体として発見されたのだ。彼の首には絞められたような跡があった。<br>
                        また、彼の遺体の横には彼が所持していたと思われる<font color="red"><b>懐中時計が22:45を指した状態で止まっている</b></font>のが見えた。<br>
                        急遽パーティーの参加者たちは談話室に集まり誰がリチャードを殺害したのか話すことになる。<br>
                        あなたは探偵として友人であるリチャードの無念を晴らすためにも、<font color="red"><b>警察が来る前に自分の手で犯人を突き止めなければならない。</b></font><br>
                        【注意】BGMが流れます`;

    // 1. タイトル画面がクリックされたら、導入文を表示
    titleScreen.addEventListener('click', () => {
        // タイトルロゴとスタートテキストを非表示に
        titleLogo.style.display = 'none';
        startText.style.display = 'none';

        // 導入文をセットして表示
        introductionText.innerHTML = story;
        introductionContainer.style.display = 'flex'; // flexで中央揃え
    }, { once: true }); // イベントを一回のみ実行する

    // 2. 導入文の画面がクリックされたら、ゲーム画面を表示
    introductionContainer.addEventListener('click', () => {
        titleScreen.style.display = 'none'; // タイトル画面全体を非表示
        // ゲーム画面を表示する
        gameScreen.style.display = 'block'; 

        // BGMをループ再生
        bgm = new Audio('/Sounds/bgm.mp3');
        bgm.loop = true;
        // ユーザー操作をきっかけに再生を開始
        bgm.play().catch(e => console.error("BGMの再生に失敗しました:", e));
        bgmCreditElement.style.display = 'block'; // BGMクレジットを表示
        updateCharacterImage(); // 初期キャラクターの画像を表示
    });

    // =================================================
    // ▼▼▼ ゲーム画面の処理 (quiz.htmlから移動) ▼▼▼
    // =================================================
    const finalDeductionScreen = document.getElementById('final-deduction-screen');
    const suspectSelect = document.getElementById('suspect-select');
    const deductionText = document.getElementById('deduction-text');
    const submitDeductionBtn = document.getElementById('submit-deduction-btn');

    // 各キャラクターとの会話履歴を保存するオブジェクト
    const conversationHistories = {
        emilia: [],
        oliver: [],
        lucy: []
    };

    const characterImage = document.getElementById('character-image');
    const chatWindow = document.getElementById('chatWindow');
    const messageInput = document.getElementById('messageInput');
    const characterSelect = document.getElementById('character-select');
    const loadingIndicator = document.getElementById('loading');
    const turnCounterElement = document.getElementById('turn-counter');
    const sendBtn = document.getElementById('sendBtn');
    let turnsLeft = 20;
    const solveBgmCreditElement = document.getElementById('solve-bgm-credit'); // 最終推理BGMクレジット要素を取得
    const bgmCreditElement = document.getElementById('bgm-credit'); // BGMクレジット要素を取得
    let bgm; // BGMオブジェクトを保持する変数

    // 送信ボタンのクリックイベント
    sendBtn.addEventListener('click', sendMessage);

    // Enterキーで送信
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // キャラクターを切り替えたら会話履歴を表示
    characterSelect.addEventListener('change', () => {
        updateCharacterImage();
        displayHistory();
    });

    // 選択中のキャラクターの画像に更新する
    function updateCharacterImage() {
        const characterId = characterSelect.value;
        let imagePath = '';
        switch (characterId) {
            case 'emilia':
                imagePath = '/Images/エミリア.png';
                break;
            case 'oliver':
                imagePath = '/Images/オリバー.png'; // ファイル名は仮定です
                break;
            case 'lucy':
                imagePath = '/Images/ルーシー.png'; // ファイル名は仮定です
                break;
        }
        characterImage.src = imagePath;
    }

    function displayHistory() {
        chatWindow.innerHTML = '';
        const currentCharacterId = characterSelect.value;
        const history = conversationHistories[currentCharacterId];
        history.forEach(msg => {
            appendMessage(msg.role, msg.parts[0].text);
        });
    }

    // メッセージ送信
    async function sendMessage() {
        // ターンが残っていない場合は送信しない
        if (turnsLeft <= 0) return;

        const message = messageInput.value.trim();
        const characterId = characterSelect.value;

        if (!message) {
            return;
        }

        // ターン数を減らしてUIを更新
        turnsLeft--;
        turnCounterElement.textContent = turnsLeft;

        // ターン数が0になったら最終推理へ
        appendMessage('user', message);
        messageInput.value = '';
        loadingIndicator.style.display = 'block';

        // 現在のキャラクターの会話履歴を取得
        const currentHistory = conversationHistories[characterId];

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    characterId: characterId,
                    history: currentHistory
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'APIエラーが発生しました');
            }

            const data = await response.json();
            const aiReply = data.reply;

            await appendMessage('model', aiReply, true); // タイプライター効果を有効に

            // 会話履歴を更新
            currentHistory.push({ role: 'user', parts: [{ text: message }] });
            currentHistory.push({ role: 'model', parts: [{ text: aiReply }] });

        } catch (error) {
            console.error('Error:', error);
            appendMessage('model', `エラー: ${error.message}`);
        } finally {
            loadingIndicator.style.display = 'none';

            // ターン数が0になったら最終推理へのボタンを表示
            if (turnsLeft <= 0) {
                messageInput.style.display = 'none'; // 入力欄を非表示に
                sendBtn.style.display = 'none'; // 送信ボタンを非表示に
                appendMessage('model', '【システム】全てのターンが終了しました。情報を整理し、準備ができたら下のボタンを押して最終推理に進んでください。');

                // ボタンを生成して追加
                const finalDeductionBtn = document.createElement('button');
                finalDeductionBtn.textContent = '最終推理に進む';
                finalDeductionBtn.id = 'go-to-deduction-btn'; // CSSでスタイルを調整する場合のID
                finalDeductionBtn.classList.add('btn'); // スタイル用のクラスを追加
                finalDeductionBtn.addEventListener('click', goToFinalDeduction);
                chatWindow.parentElement.appendChild(finalDeductionBtn);
            }
        }
    }

    // メッセージをチャットウィンドウに追加
    async function appendMessage(sender, text, useTypewriter = false) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender); // 'user' or 'model'
        chatWindow.appendChild(messageElement);

        if (useTypewriter && sender === 'model') {
            // タイプライター効果を適用
            sendBtn.disabled = true; // 表示中は送信ボタンを無効化
            await typeWriter(messageElement, text);
            sendBtn.disabled = false; // 表示完了後に有効化
        } else {
            // 通常通り表示
            messageElement.textContent = text;
            chatWindow.scrollTop = chatWindow.scrollHeight; // 自動でスクロール
        }
    }

    // タイプライター効果を実装する関数
    function typeWriter(element, text) {
        return new Promise(resolve => {
            let i = 0;
            const speed = 50; // 1文字あたりの表示速度 (ミリ秒)
            function type() {
                if (i < text.length) {
                    element.textContent += text.charAt(i);
                    i++;
                    chatWindow.scrollTop = chatWindow.scrollHeight;
                    setTimeout(type, speed);
                } else {
                    resolve(); // 表示完了
                }
            }
            type();
        });
    }

    // 最終推理画面へ移行する処理
    function goToFinalDeduction() {

        // BGMを停止
        if (bgm) {
            bgm.pause();
            bgm.currentTime = 0;
            bgmCreditElement.style.display = 'none'; // BGMクレジットを非表示
        }

        // 最終推理BGMを再生
        const solveBgm = new Audio('/Sounds/solve.mp3');
        solveBgm.loop = true; // BGMをループ再生に設定
        solveBgm.play().catch(e => console.error("最終推理BGMの再生に失敗しました:", e));

        // 2秒後に画面を切り替え
        setTimeout(() => {
            gameScreen.style.display = 'none';
            finalDeductionScreen.style.display = 'flex';
            solveBgmCreditElement.style.display = 'block'; // 最終推理BGMクレジットを表示
        }, 2000);
    }

    // 最終推理をサーバーに送信する
    async function submitDeduction() {
        const reasoning = deductionText.value.trim();

        if (!reasoning) {
            alert('事件の真相を記入してください。');
            return;
        }

        const finalDeductionContainer = finalDeductionScreen.querySelector('.container');
        // 思考中のメッセージを表示
        finalDeductionContainer.innerHTML = `
            <h2>返答を思考しています...</h2><p>しばらくお待ちください。</p>`;

        try {
            const response = await fetch('/api/final-deduction', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    characterId: suspectSelect.value,
                    reasoning: reasoning,
                    histories: conversationHistories // 全キャラクターの会話履歴を追加
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'APIエラーが発生しました');
            }

            const result = await response.json();

            // AIの応答を適切に整形する
            let finalResponseText = result.response;
            try {
                // 応答がJSON形式の文字列である場合、中身を抽出する
                const parsedResponse = JSON.parse(result.response);
                // JSONの中の最初の値を応答テキストとして採用する
                finalResponseText = Object.values(parsedResponse)[0];
            } catch (e) {
                // JSONとして解釈できない場合は、そのままのテキストを使用
            }

            // 結果を表示
            finalDeductionContainer.innerHTML = `
                <h2>${result.isCorrect ? '事件解決' : '推理失敗'}</h2>
                <p style="white-space: pre-wrap; text-align: left; background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;">${finalResponseText}</p>
                <p style="margin-top: 20px;">プレイしていただきありがとうございました。</p>
                <button id="restart-btn" class="btn">タイトルへ戻る</button>
            `;

            // タイトルへ戻るボタンにイベントリスナーを追加
            document.getElementById('restart-btn').addEventListener('click', () => {
                window.location.reload();
            });

        } catch (error) {
            // エラーが発生した場合はリロードを促す
            finalDeductionContainer.innerHTML = `<h2>エラーが発生しました</h2><p>${error.message}</p><p style="margin-top: 20px;">ページをリロードしてもう一度お試しください。</p>`;
        }
    }

    submitDeductionBtn.addEventListener('click', submitDeduction);
});