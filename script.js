let words = [];
let selectedRange = [1, 50];
let selectedMode = "choice";
let quizWords = [];
let currentIndex = 0;
let score = 0;
let wrongWords = [];
let isAnswered = false;
let retryMode = false;

const $ = id => document.getElementById(id);

async function init() {
  const res = await fetch("words.json");
  words = await res.json();
  updateHistory();
}
init().catch(err => {
  console.error(err);
  alert("単語データを読み込めませんでした。words.json が同じフォルダにあるか確認してください。");
});

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
  window.scrollTo({top: 0, behavior: "smooth"});
}

document.querySelectorAll("[data-range]").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedRange = btn.dataset.range.split("-").map(Number);
    $("selectedRangeTitle").textContent = `${selectedRange[0]}–${selectedRange[1]}`;
    showScreen("mode");
  });
});

$("modeBack").addEventListener("click", () => showScreen("home"));
$("quizBack").addEventListener("click", () => {
  if (confirm("この学習を終了しますか？")) showScreen("mode");
});
document.querySelectorAll("[data-mode]").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedMode = btn.dataset.mode;
    startQuiz(words.filter(w => w.id >= selectedRange[0] && w.id <= selectedRange[1]));
  });
});

function startQuiz(list, isRetry = false) {
  quizWords = shuffle([...list]);
  currentIndex = 0;
  score = 0;
  wrongWords = [];
  retryMode = isRetry;
  showScreen("quiz");
  renderQuestion();
}

function renderQuestion() {
  isAnswered = false;
  const item = quizWords[currentIndex];
  $("progress").textContent = `${currentIndex + 1} / ${quizWords.length}`;
  const progressTrack = document.querySelector(".progress-track");
  const progressPercent = ((currentIndex + 1) / quizWords.length) * 100;
  $("progressBar").style.width = `${progressPercent}%`;
  progressTrack.setAttribute("aria-valuemax", quizWords.length);
  progressTrack.setAttribute("aria-valuenow", currentIndex + 1);
  $("wordNumber").textContent = `No. ${item.id}`;
  $("word").textContent = item.word;
  $("meaning").textContent = item.meaning;
  $("meaning").classList.add("hidden");
  $("feedback").textContent = "";
  $("feedback").className = "feedback";
  $("cardActions").classList.toggle("hidden", selectedMode !== "card");
  $("showAnswer").classList.remove("hidden");
  $("markUnknown").classList.add("hidden");
  $("markKnown").classList.add("hidden");

  if (selectedMode === "choice") {
    $("choices").classList.remove("hidden");
    renderChoices(item);
  } else {
    $("choices").classList.add("hidden");
  }
  speak(item.word);
}

function renderChoices(correct) {
  const pool = quizWords.filter(w => w.id !== correct.id);
  const distractors = shuffle(pool).slice(0, 3);
  const choices = shuffle([correct, ...distractors]);
  $("choices").innerHTML = "";
  choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.textContent = choice.meaning;
    btn.addEventListener("click", () => answerChoice(choice.id === correct.id, btn, correct));
    $("choices").appendChild(btn);
  });
}

function answerChoice(correct, clicked, item) {
  if (isAnswered) return;
  isAnswered = true;
  document.querySelectorAll(".answer-btn").forEach(b => b.disabled = true);

  if (correct) {
    score++;
    clicked.classList.add("correct");
    setFeedback("正解！", true);
    saveAttempt(item.id, true);
  } else {
    clicked.classList.add("wrong");
    document.querySelectorAll(".answer-btn").forEach(b => {
      if (b.textContent === item.meaning) b.classList.add("correct");
    });
    wrongWords.push(item);
    setFeedback(`不正解。答え：${item.meaning}`, false);
    saveAttempt(item.id, false);
  }
  setTimeout(nextQuestion, 900);
}

function revealAnswer() {
  if (selectedMode !== "card" || !$("meaning").classList.contains("hidden")) return;
  const item = quizWords[currentIndex];
  $("meaning").classList.remove("hidden");
  $("showAnswer").classList.add("hidden");
  $("markUnknown").classList.remove("hidden");
  $("markKnown").classList.remove("hidden");
  speak(item.word);
}

$("showAnswer").addEventListener("click", revealAnswer);

$("wordPanel").addEventListener("click", event => {
  if (event.target.closest("button")) return;
  revealAnswer();
});

function answerCard(known) {
  if (isAnswered || $("meaning").classList.contains("hidden")) return;
  isAnswered = true;
  const item = quizWords[currentIndex];
  if (known) {
    score++;
    saveAttempt(item.id, true);
  } else {
    wrongWords.push(item);
    saveAttempt(item.id, false);
  }
  nextQuestion();
}

$("markUnknown").addEventListener("click", () => answerCard(false));
$("markKnown").addEventListener("click", () => answerCard(true));

document.addEventListener("keydown", event => {
  if (selectedMode !== "card" || !$("quiz").classList.contains("active")) return;
  if (event.code === "Space") {
    if (event.target.closest("button, input, textarea, select, a")) return;
    event.preventDefault();
    revealAnswer();
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if ($("meaning").classList.contains("hidden")) return;
    event.preventDefault();
    answerCard(event.key === "ArrowRight");
  }
});

function nextQuestion() {
  currentIndex++;
  if (currentIndex >= quizWords.length) finishQuiz();
  else renderQuestion();
}

function finishQuiz() {
  $("score").textContent = `${score} / ${quizWords.length}`;
  const rate = Math.round((score / quizWords.length) * 100);
  $("scoreMessage").textContent =
    rate === 100 ? "全問正解！" :
    rate >= 80 ? `正答率 ${rate}%。かなり身についています。` :
    rate >= 60 ? `正答率 ${rate}%。間違えた単語を復習してみましょう。` :
    `正答率 ${rate}%。間違えた単語を中心にもう一度やってみましょう。`;
  renderWrongList();
  $("retryWrong").classList.toggle("hidden", wrongWords.length === 0);
  showScreen("result");
  updateHistory();
}

function renderWrongList() {
  $("wrongList").innerHTML = "";
  $("noWrong").classList.toggle("hidden", wrongWords.length !== 0);
  wrongWords.forEach(item => {
    const row = document.createElement("div");
    row.className = "wrong-item";
    row.innerHTML = `
      <div>
        <div class="wrong-word">${escapeHtml(item.word)}</div>
        <div class="wrong-meaning">${escapeHtml(item.meaning)}</div>
      </div>
      <button class="speak-btn small-speak" aria-label="${escapeHtml(item.word)}を発音">🔊</button>
    `;
    row.querySelector("button").addEventListener("click", () => speak(item.word));
    $("wrongList").appendChild(row);
  });
}

$("retryWrong").addEventListener("click", () => {
  // 間違えた問題だけを再出題。再び間違えたものだけが次回の結果に残ります。
  startQuiz(wrongWords, true);
});

$("resultBack").addEventListener("click", () => showScreen("home"));

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  utterance.pitch = 1;
  speechSynthesis.speak(utterance);
}

$("speakBtn").addEventListener("click", () => speak($("word").textContent));

function setFeedback(text, correct) {
  $("feedback").textContent = text;
  $("feedback").className = `feedback ${correct ? "correct" : "wrong"}`;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function saveAttempt(id, correct) {
  const key = "english-vocab-history";
  const data = JSON.parse(localStorage.getItem(key) || '{"attempts":0,"correct":0,"wrong":0,"words":{}}');
  data.attempts++;
  if (correct) data.correct++; else data.wrong++;
  if (!data.words[id]) data.words[id] = {attempts:0, correct:0, wrong:0};
  data.words[id].attempts++;
  if (correct) data.words[id].correct++; else data.words[id].wrong++;
  localStorage.setItem(key, JSON.stringify(data));
}

function updateHistory() {
  const data = JSON.parse(localStorage.getItem("english-vocab-history") || "null");
  if (!data || data.attempts === 0) {
    $("historySummary").textContent = "まだ学習履歴がありません。";
    return;
  }
  const rate = Math.round((data.correct / data.attempts) * 100);
  $("historySummary").innerHTML = `
    <div class="history-stat">
      <div class="stat"><strong>${data.attempts}</strong><span>回答数</span></div>
      <div class="stat"><strong>${data.correct}</strong><span>正解</span></div>
      <div class="stat"><strong>${rate}%</strong><span>正答率</span></div>
    </div>`;
}

$("resetHistory").addEventListener("click", () => {
  if (confirm("学習履歴を削除しますか？")) {
    localStorage.removeItem("english-vocab-history");
    updateHistory();
  }
});

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
