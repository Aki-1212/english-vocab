let words = [];
let selectedRange = [1, 50];
let selectedMode = "choice";
let quizWords = [];
let sentenceRemaining = [];
let currentIndex = 0;
let score = 0;
let wrongWords = [];
let cardAnswers = [];
let cardHistoryAnswers = [];
let isAnswered = false;
let retryMode = false;
let learningRemaining = [];
let learningChoicePool = [];
let learningErrors = new Set();
let sentenceErrors = new Set();
let learningReview = new Set();
let learningPhase = "choice";
let learningMastered = new Set();
let learningTotal = 0;
let learningHintCount = 0;
let typingDrag = null;
let typingPopupMoved = false;
let activeRecognition = null;

const $ = id => document.getElementById(id);

async function init() {
  const [wordsResponse, sentencesResponse] = await Promise.all([
    fetch("words.json"),
    fetch("sentences.json")
  ]);
  if (!wordsResponse.ok || !sentencesResponse.ok) {
    throw new Error("単語または例文データを読み込めませんでした。");
  }
  words = await wordsResponse.json();
  const sentences = await sentencesResponse.json();
  const wordsById = new Map(words.map(item => [item.id, item]));
  for (const sentence of sentences) {
    const item = wordsById.get(sentence.id);
    if (!item) throw new Error(`例文に対応する単語がありません: ${sentence.id}`);
    if (countSentenceTarget(sentence.sentence, item.word) !== 1) {
      throw new Error(`例文に対象単語が1回だけ含まれていません: ${item.word}`);
    }
    if (!sentence.highlight || sentence.translation.split(sentence.highlight).length !== 2) {
      throw new Error(`日本語訳の強調箇所が1か所ではありません: ${item.word}`);
    }
    item.sentence = sentence.sentence;
    item.sentenceTranslation = sentence.translation;
    item.sentenceHighlight = sentence.highlight;
  }
  renderRangeButtons();
  updateSentenceModeAvailability();
  updateVoiceModeAvailability();
  const maxId = Math.max(...words.map(word => word.id));
  document.title = `English Vocabulary 1–${maxId}`;
  $("subtitle").textContent = `1–${maxId} Vocabulary Trainer`;
  updateHistory();
}
init().catch(err => {
  console.error(err);
  alert("単語・例文データを読み込めませんでした。words.json と sentences.json が同じフォルダにあるか確認してください。");
});

function showScreen(id) {
  if (id !== "quiz") stopVoiceRecognition();
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
  if (id !== "quiz") $("typingPractice").classList.add("hidden");
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
      updateSentenceModeAvailability();
      showScreen("mode");
    });
    rangeGrid.appendChild(button);
  }
}

function updateSentenceModeAvailability() {
  const button = $("sentenceModeButton");
  if (!button) return;
  const selectedWords = words.filter(word => word.id >= selectedRange[0] && word.id <= selectedRange[1]);
  const available = selectedWords.length > 0 && selectedWords.every(word => word.sentence && word.sentenceTranslation);
  button.disabled = !available;
  $("sentenceModeDescription").textContent = available
    ? "英文の空欄に単語を入力する"
    : "例文は1〜50語に対応しています";
}

function speechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function updateVoiceModeAvailability() {
  const available = Boolean(speechRecognitionConstructor());
  $("voiceModeButton").disabled = !available;
  $("voiceModeDescription").textContent = available
    ? "4択のあと、英語を音声で答える"
    : "このブラウザーは音声認識に対応していません";
}

$("modeBack").addEventListener("click", () => showScreen("home"));
$("quizBack").addEventListener("click", () => showScreen("mode"));
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
  if (selectedMode === "sentence") {
    sentenceRemaining = shuffle([...list]);
    learningMastered = new Set();
    learningTotal = list.length;
    learningReview = new Set();
    retryMode = isRetry;
    startSentenceBatch([]);
    return;
  }
  if (isLearningMode()) {
    $("typingHistory").replaceChildren();
    typingPopupMoved = false;
    learningRemaining = shuffle([...list]);
    learningChoicePool = [...list];
    learningMastered = new Set();
    learningTotal = list.length;
    learningReview = new Set();
    retryMode = isRetry;
    startLearningBatch([]);
    return;
  }
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

function startSentenceBatch(retryWords) {
  const batch = [...retryWords];
  while (batch.length < 10 && sentenceRemaining.length > 0) {
    batch.push(sentenceRemaining.shift());
  }
  if (batch.length === 0) {
    finishSentenceLearning();
    return;
  }
  quizWords = batch;
  currentIndex = 0;
  score = 0;
  wrongWords = [];
  sentenceErrors = new Set();
  cardAnswers = Array(quizWords.length).fill(null);
  cardHistoryAnswers = Array(quizWords.length).fill(null);
  updateProgressCounts();
  showScreen("quiz");
  renderQuestion();
}

function startLearningBatch(retryWords) {
  const batch = [...retryWords];
  while (batch.length < 10 && learningRemaining.length > 0) {
    batch.push(learningRemaining.shift());
  }
  if (batch.length === 0) {
    finishLearning();
    return;
  }
  quizWords = batch;
  currentIndex = 0;
  score = 0;
  wrongWords = [];
  learningErrors = new Set();
  learningPhase = "choice";
  cardAnswers = Array(quizWords.length).fill(null);
  cardHistoryAnswers = Array(quizWords.length).fill(null);
  updateProgressCounts();
  showScreen("quiz");
  renderQuestion();
}

function countSentenceTarget(sentence, word) {
  const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (sentence.match(new RegExp(`\\b${escapedWord}\\b`, "gi")) || []).length;
}

function renderSentencePrompt(sentence, word) {
  const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escapedWord}\\b`, "i").exec(sentence);
  if (!match) throw new Error(`例文に対象単語がありません: ${word}`);
  const blank = document.createElement("span");
  blank.className = "sentence-blank";
  blank.textContent = "　　　　";
  blank.setAttribute("aria-label", "空欄");
  $("sentencePrompt").replaceChildren(
    document.createTextNode(sentence.slice(0, match.index)),
    blank,
    document.createTextNode(sentence.slice(match.index + match[0].length))
  );
}

function renderSentenceTranslation(translation, highlight) {
  const start = translation.indexOf(highlight);
  if (start < 0 || translation.indexOf(highlight, start + highlight.length) >= 0) {
    throw new Error(`日本語訳の強調箇所が1か所ではありません: ${highlight}`);
  }
  const emphasized = document.createElement("strong");
  emphasized.className = "sentence-translation-highlight";
  emphasized.textContent = highlight;
  $("sentenceTranslation").replaceChildren(
    document.createTextNode(translation.slice(0, start)),
    emphasized,
    document.createTextNode(translation.slice(start + highlight.length))
  );
}

function renderQuestion() {
  stopVoiceRecognition();
  isAnswered = false;
  const item = quizWords[currentIndex];
  const previousAnswer = cardAnswers[currentIndex];
  const isLearning = isLearningMode();
  const isVoice = selectedMode === "voice";
  const isLearningInput = isLearning && learningPhase === "input";
  const isVoiceInput = isVoice && learningPhase === "input";
  const isInputPrompt = isLearningInput || isVoiceInput;
  const isSentence = selectedMode === "sentence";
  $("quiz").classList.toggle("card-mode", selectedMode === "card");
  $("quiz").classList.toggle("learning-input-mode", isInputPrompt);
  $("quiz").classList.toggle("learning-choice-mode", isLearning && learningPhase === "choice");
  $("quiz").classList.toggle("sentence-mode", isSentence);
  $("wordPanel").classList.toggle("card-known", selectedMode === "card" && previousAnswer === true);
  $("wordPanel").classList.toggle("card-unknown", selectedMode === "card" && previousAnswer === false);
  $("progressTitle").textContent = isLearning || isSentence ? "全体進捗" : "進捗";
  $("learningStageProgress").classList.toggle("hidden", !isLearning && !isSentence);
  if (isLearning || isSentence) {
    $("learningStageProgress").textContent = isSentence
      ? `文章 ${currentIndex + 1} / ${quizWords.length}`
      : `${learningPhase === "choice" ? "4択" : isVoice ? "音声" : "入力"} ${currentIndex + 1} / ${quizWords.length}`;
    updateLearningProgress();
  } else {
    $("progress").textContent = `${currentIndex + 1} / ${quizWords.length}`;
    const progressTrack = document.querySelector(".progress-track");
    const progressPercent = ((currentIndex + 1) / quizWords.length) * 100;
    $("progressBar").style.width = `${progressPercent}%`;
    progressTrack.setAttribute("aria-label", "問題の進捗");
    progressTrack.setAttribute("aria-valuemax", quizWords.length);
    progressTrack.setAttribute("aria-valuenow", currentIndex + 1);
  }
  $("wordNumber").textContent = `No. ${item.id}`;
  $("word").textContent = isInputPrompt ? item.meaning : item.word;
  $("word").classList.toggle("hidden", isSentence);
  $("sentencePrompt").classList.toggle("hidden", !isSentence);
  $("sentenceTranslation").classList.toggle("hidden", !isSentence);
  if (isSentence) {
    renderSentencePrompt(item.sentence, item.word);
    renderSentenceTranslation(item.sentenceTranslation, item.sentenceHighlight);
  }
  resetTypingPractice(item.word);
  $("meaning").textContent = item.meaning;
  $("meaning").classList.toggle("hidden", previousAnswer === null || isLearning || isSentence);
  $("feedback").textContent = "";
  $("feedback").className = "feedback";
  $("speakBtn").classList.toggle("hidden", isInputPrompt || isSentence);
  learningHintCount = 0;
  $("hintBtn").classList.toggle("hidden", !isLearningInput && !isVoiceInput);
  $("hintBtn").disabled = !isLearningInput && !isVoiceInput;
  $("hintBtn").textContent = "ヒント";
  $("cardActions").classList.toggle("hidden", selectedMode !== "card");
  $("learningInput").classList.toggle("hidden", !isLearningInput);
  $("voiceInput").classList.toggle("hidden", !isVoiceInput);
  $("voiceRecognitionStatus").textContent = "マイクを押して回答";
  $("startVoiceAnswer").disabled = false;
  $("startVoiceAnswer").textContent = "🎙 音声で回答";
  $("voiceDontKnow").disabled = false;
  $("sentenceInput").classList.toggle("hidden", !isSentence);
  $("sentenceAnswer").value = "";
  $("sentenceAnswer").disabled = false;
  $("submitSentenceAnswer").disabled = false;
  $("previousCard").disabled = currentIndex === 0;
  $("markUnknown").disabled = false;
  $("markKnown").disabled = false;
  $("markUnknown").classList.toggle("selected", previousAnswer === false);
  $("markKnown").classList.toggle("selected", previousAnswer === true);
  $("englishAnswer").value = "";
  $("submitEnglish").disabled = false;
  $("dontKnow").disabled = false;
  $("choiceDontKnow").disabled = false;
  if (selectedMode === "card" && previousAnswer !== null) {
    setFeedback(previousAnswer ? "覚えている" : "覚えていない", previousAnswer);
  }

  const showChoices = selectedMode === "choice" || (isLearning && learningPhase === "choice");
  $("choices").classList.toggle("hidden", !showChoices);
  $("choiceDontKnow").classList.toggle("hidden", !isLearning || learningPhase !== "choice");
  if (showChoices) renderChoices(item);
  if (!isInputPrompt && !isSentence) speak(item.word);
  else {
    if (isInputPrompt) {
      speakJapanese(item.meaning);
      if (isLearningInput) $("englishAnswer").focus();
    } else if (isSentence) {
      $("sentenceAnswer").focus();
    }
  }
  updateTypingPracticeVisibility();
}

function resetTypingPractice(word) {
  const input = $("typingPracticeInput");
  input.value = "";
  input.dataset.targetWord = word;
  updateTypingPractice();
}

function updateTypingPractice() {
  const input = $("typingPracticeInput");
  const target = input.dataset.targetWord || "";
  const typed = input.value;
  const normalizedTarget = target.toLowerCase();
  const normalizedTyped = typed.toLowerCase();
  const isCorrect = normalizedTyped === normalizedTarget;
  const isComplete = typed.length >= target.length;
  const prompt = $("typingPrompt");
  prompt.replaceChildren();

  for (let index = 0; index < Math.max(target.length, typed.length); index++) {
    const character = document.createElement("span");
    const typedCharacter = typed[index];
    character.textContent = typedCharacter ?? target[index];
    character.className = "typing-character";
    if (typedCharacter !== undefined) {
      if (isCorrect) character.classList.add("complete");
      else if (normalizedTyped[index] === normalizedTarget[index]) character.classList.add("typed");
      else character.classList.add("incorrect");
    }
    prompt.appendChild(character);
  }

  const status = $("typingStatus");
  status.textContent = isCorrect ? "正解" : isComplete ? "もう一度" : "";
  status.className = `typing-status${isCorrect ? " complete" : isComplete ? " incorrect" : ""}`;
}

function canUseDesktopTyping() {
  return window.matchMedia("(min-width: 768px) and (hover: hover) and (pointer: fine)").matches;
}

function updateTypingPracticeVisibility() {
  const shouldShow = selectedMode === "learning" && learningPhase === "choice" &&
    $("quiz").classList.contains("active") && canUseDesktopTyping();
  $("typingPractice").classList.toggle("hidden", !shouldShow);
  if (shouldShow && !typingPopupMoved) positionTypingPractice();
}

function positionTypingPractice() {
  const popup = $("typingPractice");
  const wordRect = $("word").getBoundingClientRect();
  popup.style.left = "0px";
  popup.style.top = "0px";
  const popupRect = popup.getBoundingClientRect();
  let left = wordRect.right + 14;
  if (left + popupRect.width > window.innerWidth - 12) {
    left = wordRect.left - popupRect.width - 14;
  }
  left = Math.min(Math.max(12, left), window.innerWidth - popupRect.width - 12);
  const top = Math.min(Math.max(12, wordRect.top), window.innerHeight - popupRect.height - 12);
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

function clampTypingPracticePosition() {
  const popup = $("typingPractice");
  const rect = popup.getBoundingClientRect();
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - rect.width - 12);
  const top = Math.min(Math.max(12, rect.top), window.innerHeight - rect.height - 12);
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

function submitTypingPractice() {
  const input = $("typingPracticeInput");
  if (!input.value) return;
  const correct = input.value.toLowerCase() === (input.dataset.targetWord || "").toLowerCase();
  const row = document.createElement("div");
  row.className = `typing-result${correct ? " correct" : " incorrect"}`;
  const typedWord = document.createElement("span");
  typedWord.textContent = input.value;
  const result = document.createElement("strong");
  result.textContent = correct ? "✓" : "×";
  row.append(typedWord, result);
  $("typingHistory").appendChild(row);
  $("typingHistory").scrollTop = $("typingHistory").scrollHeight;
  input.value = "";
  updateTypingPractice();
  input.focus();
}

$("typingPracticeHandle").addEventListener("pointerdown", event => {
  if (event.button !== 0) return;
  const rect = $("typingPractice").getBoundingClientRect();
  typingDrag = {pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top};
  event.currentTarget.setPointerCapture(event.pointerId);
  event.preventDefault();
});
$("typingPracticeHandle").addEventListener("pointermove", event => {
  if (!typingDrag || event.pointerId !== typingDrag.pointerId) return;
  const moved = Math.abs(event.clientX - typingDrag.startX) + Math.abs(event.clientY - typingDrag.startY) > 3;
  if (moved) typingPopupMoved = true;
  const popup = $("typingPractice");
  popup.style.left = `${typingDrag.left + event.clientX - typingDrag.startX}px`;
  popup.style.top = `${typingDrag.top + event.clientY - typingDrag.startY}px`;
  clampTypingPracticePosition();
});
$("typingPracticeHandle").addEventListener("pointerup", () => { typingDrag = null; });
$("typingPracticeHandle").addEventListener("pointercancel", () => { typingDrag = null; });
window.addEventListener("resize", () => {
  updateTypingPracticeVisibility();
  if (typingPopupMoved && !$("typingPractice").classList.contains("hidden")) clampTypingPracticePosition();
});
window.addEventListener("scroll", () => {
  if (!typingPopupMoved && !$("typingPractice").classList.contains("hidden")) positionTypingPractice();
}, {passive: true});

function renderChoices(correct) {
  const sourceWords = isLearningMode() ? learningChoicePool : quizWords;
  const pool = sourceWords.filter(w => w.id !== correct.id);
  const distractors = shuffle(pool).slice(0, 3);
  const choices = shuffle([correct, ...distractors]);
  $("choices").innerHTML = "";
  choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.textContent = choice.meaning;
    btn.addEventListener("click", () => {
      if (isLearningMode()) answerLearningChoice(choice.id === correct.id, btn, correct);
      else answerChoice(choice.id === correct.id, btn, correct);
    });
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
    setFeedback(item.meaning, null);
    saveAttempt(item.id, false);
  }
  updateProgressCounts();
  setTimeout(nextQuestion, 900);
}

function answerLearningChoice(correct, clicked, item) {
  if (isAnswered) return;
  isAnswered = true;
  document.querySelectorAll(".answer-btn").forEach(button => button.disabled = true);
  $("choiceDontKnow").disabled = true;
  if (correct) {
    clicked.classList.add("correct");
    setFeedback("正解！", true);
  } else {
    learningErrors.add(item.id);
    learningReview.add(item.id);
    if (clicked) clicked.classList.add("wrong");
    document.querySelectorAll(".answer-btn").forEach(button => {
      if (button.textContent === item.meaning) button.classList.add("correct");
    });
    setFeedback(item.meaning, null);
  }
  updateProgressCounts();
  setTimeout(() => {
    currentIndex++;
    if (currentIndex < quizWords.length) {
      renderQuestion();
    } else {
      learningPhase = "input";
      currentIndex = 0;
      renderQuestion();
    }
  }, 700);
}

function answerLearningInput(dontKnow = false, answerOverride = null) {
  if (isAnswered) return;
  const item = quizWords[currentIndex];
  const answer = (answerOverride ?? $("englishAnswer").value).trim().toLowerCase();
  const correct = !dontKnow && answer === item.word.toLowerCase();
  isAnswered = true;
  $("submitEnglish").disabled = true;
  $("dontKnow").disabled = true;
  $("startVoiceAnswer").disabled = true;
  $("voiceDontKnow").disabled = true;
  if (!correct) {
    learningErrors.add(item.id);
    learningReview.add(item.id);
  } else if (!learningErrors.has(item.id)) {
    learningMastered.add(item.id);
    learningReview.delete(item.id);
  }
  const feedback = correct ? "正解！" : answerOverride
    ? `聞き取り: ${answerOverride} / 答え: ${item.word}`
    : `答え: ${item.word}`;
  setFeedback(feedback, correct);
  saveAttempt(item.id, !learningErrors.has(item.id));
  updateProgressCounts();
  setTimeout(() => {
    currentIndex++;
    if (currentIndex < quizWords.length) renderQuestion();
    else finishLearningBatch();
  }, 800);
}

function answerSentenceInput() {
  if (isAnswered) return;
  const item = quizWords[currentIndex];
  const answer = $("sentenceAnswer").value.trim().toLowerCase();
  if (!answer) {
    setFeedback("英単語を入力してください。", null);
    return;
  }
  const correct = answer === item.word.toLowerCase();
  isAnswered = true;
  $("sentenceAnswer").disabled = true;
  $("submitSentenceAnswer").disabled = true;
  if (!correct) {
    sentenceErrors.add(item.id);
    learningReview.add(item.id);
  } else if (!sentenceErrors.has(item.id)) {
    learningMastered.add(item.id);
    learningReview.delete(item.id);
  }
  setFeedback(correct ? "正解！" : `答え: ${item.word}`, correct);
  saveAttempt(item.id, !sentenceErrors.has(item.id));
  updateProgressCounts();
  setTimeout(() => {
    currentIndex++;
    if (currentIndex < quizWords.length) renderQuestion();
    else finishSentenceBatch();
  }, 800);
}

function finishSentenceBatch() {
  wrongWords = quizWords.filter(item => sentenceErrors.has(item.id));
  startSentenceBatch(wrongWords);
}

function finishSentenceLearning() {
  wrongWords = [];
  score = learningMastered.size;
  $("score").textContent = `${learningMastered.size} / ${learningTotal}`;
  $("scoreMessage").textContent = "すべての単語を覚えました！";
  renderWrongList();
  $("retryWrong").classList.add("hidden");
  showScreen("result");
  updateHistory();
}

function finishLearningBatch() {
  wrongWords = quizWords.filter(item => learningErrors.has(item.id));
  updateProgressCounts();
  startLearningBatch(wrongWords);
}

function finishLearning() {
  wrongWords = [];
  score = learningMastered.size;
  $("score").textContent = `${learningMastered.size} / ${learningTotal}`;
  $("scoreMessage").textContent = "すべての単語を覚えました！";
  renderWrongList();
  $("retryWrong").classList.add("hidden");
  showScreen("result");
  updateHistory();
}

$("submitEnglish").addEventListener("click", () => answerLearningInput());
$("dontKnow").addEventListener("click", () => answerLearningInput(true));
$("startVoiceAnswer").addEventListener("click", startVoiceRecognition);
$("voiceDontKnow").addEventListener("click", () => answerLearningInput(true));
$("submitSentenceAnswer").addEventListener("click", answerSentenceInput);
$("typingPracticeInput").addEventListener("input", updateTypingPractice);
$("typingSubmit").addEventListener("click", submitTypingPractice);
$("typingPracticeInput").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitTypingPractice();
  }
});
$("choiceDontKnow").addEventListener("click", () => {
  answerLearningChoice(false, null, quizWords[currentIndex]);
});
$("englishAnswer").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    answerLearningInput();
  }
});
$("sentenceAnswer").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    answerSentenceInput();
  }
});

$("hintBtn").addEventListener("click", () => {
  if (!isLearningMode() || learningPhase !== "input" || isAnswered) return;
  const answer = quizWords[currentIndex].word;
  learningHintCount = Math.min(learningHintCount + 1, answer.length);
  const hint = [...answer].map((character, index) =>
    index < learningHintCount ? character : "・"
  ).join("");
  $("feedback").textContent = `ヒント: ${hint}`;
  $("feedback").className = "feedback hint";
  $("hintBtn").textContent = learningHintCount === answer.length ? "すべて表示" : `ヒント ${learningHintCount}/${answer.length}`;
  $("hintBtn").disabled = learningHintCount === answer.length;
});

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
  $("wordPanel").classList.toggle("card-known", known);
  $("wordPanel").classList.toggle("card-unknown", !known);
  $("markUnknown").classList.toggle("selected", !known);
  $("markKnown").classList.toggle("selected", known);
  setFeedback(known ? "覚えている" : "覚えていない", known);
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
  if (!$("quiz").classList.contains("active")) return;
  if (isLearningMode() && learningPhase === "choice" && event.code === "Space") {
    if (event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    event.preventDefault();
    if (!event.repeat) speak(quizWords[currentIndex].word);
    return;
  }
  if (selectedMode !== "card") return;
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

function speakJapanese(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 0.95;
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
  const state = correct === null ? "answer-only" : correct ? "correct" : "wrong";
  $("feedback").className = `feedback ${state}`;
}

function updateProgressCounts() {
  if (isLearningMode() || selectedMode === "sentence") {
    $("knownCount").textContent = learningMastered.size;
    $("unknownCount").textContent = learningReview.size;
    updateLearningProgress();
    return;
  }
  $("knownCount").textContent = score;
  $("unknownCount").textContent = wrongWords.length;
}

function isLearningMode() {
  return selectedMode === "learning" || selectedMode === "voice";
}

function stopVoiceRecognition() {
  if (!activeRecognition) return;
  const recognition = activeRecognition;
  activeRecognition = null;
  recognition.abort();
}

function startVoiceRecognition() {
  if (selectedMode !== "voice" || learningPhase !== "input" || isAnswered) return;
  const Recognition = speechRecognitionConstructor();
  if (!Recognition) {
    $("voiceRecognitionStatus").textContent = "このブラウザーは音声認識に対応していません";
    return;
  }

  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  activeRecognition = recognition;
  $("startVoiceAnswer").disabled = true;
  $("startVoiceAnswer").textContent = "聞き取り中...";
  $("voiceRecognitionStatus").textContent = "英単語を話してください";

  recognition.onresult = event => {
    let transcript = "";
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index];
      if (result.isFinal) transcript += result[0].transcript;
      else $("voiceRecognitionStatus").textContent = `聞き取り中: ${result[0].transcript}`;
    }
    if (!transcript.trim()) return;
    recognition.stop();
    activeRecognition = null;
    $("voiceRecognitionStatus").textContent = `認識: ${transcript.trim()}`;
    answerLearningInput(false, transcript.trim().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ""));
  };
  recognition.onerror = event => {
    if (activeRecognition !== recognition) return;
    activeRecognition = null;
    $("startVoiceAnswer").disabled = false;
    $("startVoiceAnswer").textContent = "🎙 もう一度話す";
    const message = event.error === "not-allowed" || event.error === "service-not-allowed"
      ? "マイクの使用が許可されていません"
      : event.error === "no-speech"
        ? "音声を認識できませんでした。もう一度お試しください"
        : "音声を認識できませんでした。もう一度お試しください";
    $("voiceRecognitionStatus").textContent = message;
  };
  recognition.onend = () => {
    if (activeRecognition !== recognition) return;
    activeRecognition = null;
    $("startVoiceAnswer").disabled = false;
    $("startVoiceAnswer").textContent = "🎙 もう一度話す";
    $("voiceRecognitionStatus").textContent = "認識できませんでした。もう一度お試しください";
  };
  try {
    recognition.start();
  } catch {
    activeRecognition = null;
    $("startVoiceAnswer").disabled = false;
    $("startVoiceAnswer").textContent = "🎙 もう一度話す";
    $("voiceRecognitionStatus").textContent = "マイクを開始できませんでした。もう一度お試しください";
  }
}

function updateLearningProgress() {
  $("progress").textContent = `${learningMastered.size} / ${learningTotal}`;
  const progressTrack = document.querySelector(".progress-track");
  const progressPercent = (learningMastered.size / learningTotal) * 100;
  $("progressBar").style.width = `${progressPercent}%`;
  progressTrack.setAttribute("aria-label", "選択範囲全体の習得進捗");
  progressTrack.setAttribute("aria-valuemax", learningTotal);
  progressTrack.setAttribute("aria-valuenow", learningMastered.size);
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
