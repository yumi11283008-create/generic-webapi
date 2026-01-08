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
                        その後外の天候が急に悪くなったため、彼の邸宅に泊めてもらう流れになる。<br>
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
        const bgm = new Audio('/Sounds/bgm.mp3');
        bgm.loop = true;
        // ユーザー操作をきっかけに再生を開始
        bgm.play().catch(e => console.error("BGMの再生に失敗しました:", e));
        updateCharacterImage(); // 初期キャラクターの画像を表示
    });

    // =================================================
    // ▼▼▼ ゲーム画面の処理 (quiz.htmlから移動) ▼▼▼
    // =================================================

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
        // ターン数チェック
        if (turnsLeft <= 0) {
            alert('会話は終了しました。犯人を推理してください。');
            return;
        }

        const message = messageInput.value.trim();
        const characterId = characterSelect.value;

        if (!message) {
            return;
        }

        // ターン数を減らしてUIを更新
        turnsLeft--;
        turnCounterElement.textContent = turnsLeft;

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

            appendMessage('model', aiReply);

            // 会話履歴を更新
            currentHistory.push({ role: 'user', parts: [{ text: message }] });
            currentHistory.push({ role: 'model', parts: [{ text: aiReply }] });

        } catch (error) {
            console.error('Error:', error);
            appendMessage('model', `エラー: ${error.message}`);
        } finally {
            loadingIndicator.style.display = 'none';
            // ターン数が0になったら操作を無効化
            if (turnsLeft <= 0) {
                messageInput.disabled = true;
                sendBtn.disabled = true;
                appendMessage('model', '【システム】会話可能な回数がなくなりました。犯人を特定してください。');
            }
        }
    }

    // メッセージをチャットウィンドウに追加
    function appendMessage(sender, text) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender); // 'user' or 'model'
        messageElement.textContent = text;
        chatWindow.appendChild(messageElement);
        chatWindow.scrollTop = chatWindow.scrollHeight; // 自動でスクロール
    }
});