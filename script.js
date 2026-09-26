let words = [];
let selectedRange = [1, 50];
let selectedMode = "choice";
let quizWords = [];
let currentIndex = 0;
let score = 0;
let wrongWords = [];
let cardAnswers = [];
let cardHistoryAnswers = [];
let isAnswered = false;
let retryMode = false;

const $ = id => document.getElementById(id);

async function init() {
  const res = await fetch("words.json");
  words = await res.json();
  renderRangeButtons();
  const maxId = Math.max(...words.map(word => word.id));
  document.title = `English Vocabulary 1–${maxId}`;
  $("subtitle").textContent = `1–${maxId} Vocabulary Trainer`;
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

function renderRangeButtons() {
  const maxId = Math.max(...words.map(word => word.id));
  const rangeGrid = $("rangeGrid");
  const lastRange = getLastStartedRange();
  rangeGrid.innerHTML = "";

  for (let start = 1; start <= maxId; start += 50) {
    const end = Math.min(start + 49, maxId);
    const count = words.filter(word => word.id >= start && word.id <= end).length;
    if (count === 0) continue;

    const button = document.createElement("button");
    button.className = "choice-btn";
    button.dataset.range = `${start}-${end}`;
    if (lastRange?.[0] === start && lastRange?.[1] === end) {
      button.classList.add("last-range");
    }
    const rangeLabel = document.createElement("strong");
    rangeLabel.textContent = `${start}–${end}`;
    const wordCount = document.createElement("span");
    wordCount.textContent = `${count} words`;
    button.append(rangeLabel, wordCount);
    if (lastRange?.[0] === start && lastRange?.[1] === end) {
      const lastStarted = document.createElement("span");
      lastStarted.className = "last-range-label";
      lastStarted.textContent = "前回";
      button.appendChild(lastStarted);
    }
    button.addEventListener("click", () => {
      selectedRange = [start, end];
      $("selectedRangeTitle").textContent = `${start}–${end}`;
      showScreen("mode");
    });
    rangeGrid.appendChild(button);
  }
}

$("modeBack").addEventListener("click", () => showScreen("home"));
$("quizBack").addEventListener("click", () => {
  if (confirm("この学習を終了しますか？")) showScreen("mode");
});
document.querySelectorAll("[data-mode]").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedMode = btn.dataset.mode;
    localStorage.setItem("english-vocab-last-range", JSON.stringify(selectedRange));
    renderRangeButtons();
    startQuiz(words.filter(w => w.id >= selectedRange[0] && w.id <= selectedRange[1]));
  });
});

function getLastStartedRange() {
  try {
    const range = JSON.parse(localStorage.getItem("english-vocab-last-range") || "null");
    return Array.isArray(range) && range.length === 2 && range.every(Number.isInteger) ? range : null;
  } catch {
    return null;
  }
}

function startQuiz(list, isRetry = false) {
  quizWords = shuffle([...list]);
  currentIndex = 0;
  score = 0;
  wrongWords = [];
  cardAnswers = Array(quizWords.length).fill(null);
  cardHistoryAnswers = Array(quizWords.length).fill(null);
  retryMode = isRetry;
  updateProgressCounts();
  showScreen("quiz");
  renderQuestion();
}

function renderQuestion() {
  isAnswered = false;
  const item = quizWords[currentIndex];
  const previousAnswer = cardAnswers[currentIndex];
  $("quiz").classList.toggle("card-mode", selectedMode === "card");
  $("progress").textContent = `${currentIndex + 1} / ${quizWords.length}`;
  const progressTrack = document.querySelector(".progress-track");
  const progressPercent = ((currentIndex + 1) / quizWords.length) * 100;
  $("progressBar").style.width = `${progressPercent}%`;
  progressTrack.setAttribute("aria-valuemax", quizWords.length);
  progressTrack.setAttribute("aria-valuenow", currentIndex + 1);
  $("wordNumber").textContent = `No. ${item.id}`;
  $("word").textContent = item.word;
  $("meaning").textContent = item.meaning;
  $("meaning").classList.toggle("hidden", previousAnswer === null);
  $("feedback").textContent = "";
  $("feedback").className = "feedback";
  $("cardActions").classList.toggle("hidden", selectedMode !== "card");
  $("previousCard").disabled = currentIndex === 0;
  $("markUnknown").disabled = false;
  $("markKnown").disabled = false;
  $("markUnknown").classList.toggle("selected", previousAnswer === false);
  $("markKnown").classList.toggle("selected", previousAnswer === true);
  if (selectedMode === "card" && previousAnswer !== null) {
    setFeedback(previousAnswer ? "覚えているに登録済み" : "覚えていないに登録済み", previousAnswer);
  }

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
  updateProgressCounts();
  setTimeout(nextQuestion, 900);
}

function revealAnswer() {
  if (selectedMode !== "card" || isAnswered || !$("meaning").classList.contains("hidden")) return;
  const item = quizWords[currentIndex];
  $("meaning").classList.remove("hidden");
  speak(item.word);
}

$("wordPanel").addEventListener("click", event => {
  if (event.target.closest("button")) return;
  revealAnswer();
});

let swipeStart = null;
$("wordPanel").addEventListener("touchstart", event => {
  if (selectedMode !== "card" || !$("quiz").classList.contains("active") ||
      event.touches.length !== 1 || event.target.closest("button")) {
    swipeStart = null;
    return;
  }
  swipeStart = {
    x: event.touches[0].clientX,
    y: event.touches[0].clientY
  };
}, {passive: true});

$("wordPanel").addEventListener("touchend", event => {
  if (!swipeStart || selectedMode !== "card" || isAnswered) {
    swipeStart = null;
    return;
  }
  const deltaX = event.changedTouches[0].clientX - swipeStart.x;
  const deltaY = event.changedTouches[0].clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
  answerCard(deltaX > 0);
}, {passive: true});

$("wordPanel").addEventListener("touchcancel", () => {
  swipeStart = null;
}, {passive: true});

function answerCard(known) {
  if (isAnswered) return;
  const wasAnswered = cardAnswers[currentIndex] !== null;
  isAnswered = true;
  $("markUnknown").disabled = true;
  $("markKnown").disabled = true;
  $("previousCard").disabled = true;
  const item = quizWords[currentIndex];
  cardAnswers[currentIndex] = known;
  score = cardAnswers.filter(answer => answer === true).length;
  wrongWords = quizWords.filter((_, index) => cardAnswers[index] === false);
  if (!wasAnswered || cardHistoryAnswers[currentIndex] === null) {
    saveAttempt(item.id, known);
  } else if (cardHistoryAnswers[currentIndex] !== known) {
    removeAttempt(item.id, cardHistoryAnswers[currentIndex]);
    saveAttempt(item.id, known);
  }
  cardHistoryAnswers[currentIndex] = known;
  updateProgressCounts();
  $("markUnknown").classList.toggle("selected", !known);
  $("markKnown").classList.toggle("selected", known);
  setFeedback("登録しました", known);
  setTimeout(nextQuestion, 650);
}

$("markUnknown").addEventListener("click", () => answerCard(false));
$("markKnown").addEventListener("click", () => answerCard(true));
$("previousCard").addEventListener("click", () => {
  if (currentIndex === 0 || isAnswered) return;
  const previousIndex = currentIndex - 1;
  const previousItem = quizWords[previousIndex];
  if (cardAnswers[previousIndex] !== null) {
    if (cardHistoryAnswers[previousIndex] !== null) {
      removeAttempt(previousItem.id, cardHistoryAnswers[previousIndex]);
    }
    cardAnswers[previousIndex] = null;
    cardHistoryAnswers[previousIndex] = null;
    score = cardAnswers.filter(answer => answer === true).length;
    wrongWords = quizWords.filter((_, index) => cardAnswers[index] === false);
    updateProgressCounts();
  }
  currentIndex--;
  renderQuestion();
});

document.addEventListener("keydown", event => {
  if (selectedMode !== "card" || !$("quiz").classList.contains("active")) return;
  if (event.code === "Space") {
    if (event.target.closest("button, input, textarea, select, a")) return;
    event.preventDefault();
    revealAnswer();
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    revealAnswer();
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
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
  const voices = speechSynthesis.getVoices();
  const englishVoices = voices.filter(voice => /^en([_-]|$)/i.test(voice.lang));
  const usVoices = englishVoices.filter(voice => /^en[-_]us([_-]|$)/i.test(voice.lang));
  const candidates = usVoices.length ? usVoices : englishVoices;
  const preferredVoice = candidates.sort((a, b) => voiceQuality(b) - voiceQuality(a))[0];
  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  utterance.pitch = 1;
  speechSynthesis.speak(utterance);
}

function voiceQuality(voice) {
  const name = voice.name.toLowerCase();
  let score = 0;
  if (/natural|enhanced|premium|neural/.test(name)) score += 3;
  if (/google us english/.test(name)) score += 2;
  if (/^en[-_]us$/i.test(voice.lang)) score += 1;
  return score;
}

$("speakBtn").addEventListener("click", () => speak($("word").textContent));

function setFeedback(text, correct) {
  $("feedback").textContent = text;
  $("feedback").className = `feedback ${correct ? "correct" : "wrong"}`;
}

function updateProgressCounts() {
  $("knownCount").textContent = score;
  $("unknownCount").textContent = wrongWords.length;
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

function removeAttempt(id, correct) {
  const key = "english-vocab-history";
  const data = JSON.parse(localStorage.getItem(key) || "null");
  const wordData = data?.words?.[id];
  if (!data || !wordData || wordData.attempts === 0) return;

  data.attempts = Math.max(0, data.attempts - 1);
  data[correct ? "correct" : "wrong"] = Math.max(0, data[correct ? "correct" : "wrong"] - 1);
  wordData.attempts--;
  wordData[correct ? "correct" : "wrong"]--;
  if (wordData.attempts === 0) delete data.words[id];
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
