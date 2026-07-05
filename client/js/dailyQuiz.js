// ============================================================
// dailyQuiz.js — 每日文物问答系统
// 每天5道题，混合选择题+判断题，从CARD_LORE数据动态生成
// ============================================================

const DAILY_QUIZ_KEY = 'mwDailyQuiz';

/** 获取今日日期字符串 (YYYY-MM-DD) */
function _getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** 用日期做种子的伪随机数生成器 */
function _seededRandom(seed) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = ((s * 31) + seed.charCodeAt(i)) | 0;
  return function() {
    s = (s * 1103515245 + 12345) | 0;
    return ((s >>> 16) & 0x7fff) / 0x7fff;
  };
}

/** 打乱数组（Fisher-Yates） */
function _shuffleArr(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 生成5道题目 */
function _generateQuestions() {
  const today = _getTodayStr();
  const rng = _seededRandom(today);
  const cardIds = [...ARTIFACT_IDS];
  const shuffled = _shuffleArr(cardIds, rng);
  const questions = [];

  const questionGenerators = [
    // 1. 选择题：某文物现存于哪个博物馆？
    () => {
      const cardId = shuffled[0];
      const lore = CARD_LORE[cardId];
      const correct = lore.museum;
      const wrongMuseums = ['故宫博物院', '中国国家博物馆', '三星堆博物馆', '湖南博物院', '秦始皇帝陵博物院', '湖北省博物馆', '河北博物院', '陕西历史博物馆', '敦煌研究院', '台北故宫博物院']
        .filter(m => m !== correct);
      const options = _shuffleArr([correct, ...wrongMuseums.slice(0, 3)], rng);
      return {
        type: 'choice',
        question: `${CARD_NAMES[cardId]} 现存于哪个博物馆？`,
        options,
        answer: options.indexOf(correct),
        cardId,
      };
    },
    // 2. 判断题：某文物出土年份
    () => {
      const cardId = shuffled[1];
      const lore = CARD_LORE[cardId];
      const isTrue = rng() > 0.5;
      let statement;
      if (isTrue) {
        statement = `${CARD_NAMES[cardId]} 出土于${lore.excavatedYear}。`;
      } else {
        const otherYears = ['1950年', '1980年', '2000年', '1965年', '1990年'].filter(y => y !== lore.excavatedYear);
        const wrongYear = otherYears[Math.floor(rng() * otherYears.length)];
        statement = `${CARD_NAMES[cardId]} 出土于${wrongYear}。`;
      }
      return {
        type: 'truefalse',
        question: statement,
        answer: isTrue,
        cardId,
      };
    },
    // 3. 选择题：某文物属于哪个朝代？
    () => {
      const cardId = shuffled[2];
      const lore = CARD_LORE[cardId];
      const correct = lore.dynasty;
      const wrongDynasties = ['商代', '秦代', '汉代', '唐代', '宋代', '元代', '明代', '清代', '战国', '东晋', '北宋', '西汉']
        .filter(d => d !== correct);
      const options = _shuffleArr([correct, ...wrongDynasties.slice(0, 3)], rng);
      return {
        type: 'choice',
        question: `${CARD_NAMES[cardId]} 属于哪个朝代？`,
        options,
        answer: options.indexOf(correct),
        cardId,
      };
    },
    // 4. 判断题：某文物的技能
    () => {
      const cardId = shuffled[3];
      const lore = CARD_LORE[cardId];
      const isTrue = rng() > 0.5;
      let statement;
      if (isTrue) {
        statement = `${CARD_NAMES[cardId]} 的技能是「${lore.skillName}」：${lore.skillDesc}`;
      } else {
        const otherCard = shuffled[Math.floor(rng() * shuffled.length)];
        const otherLore = CARD_LORE[otherCard];
        if (otherCard === cardId || otherLore.skillName === lore.skillName) {
          statement = `${CARD_NAMES[cardId]} 的技能是「${lore.skillName}」：${lore.skillDesc}`;
        } else {
          statement = `${CARD_NAMES[cardId]} 的技能是「${otherLore.skillName}」：${otherLore.skillDesc}`;
        }
      }
      // 重新判断
      const actualDesc = lore.skillDesc;
      const usedDesc = statement.split('：')[1] || '';
      const realIsTrue = usedDesc.includes(actualDesc) || statement.includes(lore.skillName + '」：' + actualDesc);
      return {
        type: 'truefalse',
        question: statement,
        answer: realIsTrue,
        cardId,
      };
    },
    // 5. 选择题：文物简介相关
    () => {
      const cardId = shuffled[4];
      const lore = CARD_LORE[cardId];
      const otherCards = shuffled.filter(id => id !== cardId).slice(0, 3);
      const options = _shuffleArr([cardId, ...otherCards], rng);
      return {
        type: 'choice',
        question: `以下哪件文物的简介提到了"${lore.brief.substring(0, 15)}..."？`,
        options: options.map(id => CARD_NAMES[id]),
        answer: options.indexOf(cardId),
        cardId,
      };
    },
  ];

  for (const gen of questionGenerators) {
    try {
      const q = gen();
      if (q) questions.push(q);
    } catch (e) {
      console.warn('[DailyQuiz] 生成题目失败', e);
    }
  }

  return questions;
}

/** 获取今日问答数据（含已答状态） */
function getDailyQuiz() {
  const today = _getTodayStr();
  try {
    const raw = localStorage.getItem(DAILY_QUIZ_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.date === today) return data;
    }
  } catch (e) { /* ignore */ }

  // 生成新一天的题目
  const questions = _generateQuestions();
  const data = {
    date: today,
    answered: 0,
    correct: 0,
    questions: questions.map(q => ({ ...q, userAnswer: null })),
  };
  localStorage.setItem(DAILY_QUIZ_KEY, JSON.stringify(data));
  return data;
}

/** 提交答案 */
function submitDailyQuizAnswer(questionIndex, userAnswer) {
  const data = getDailyQuiz();
  if (questionIndex < 0 || questionIndex >= data.questions.length) return null;
  const q = data.questions[questionIndex];
  if (q.userAnswer !== null) return data; // 已答过

  q.userAnswer = userAnswer;
  const isCorrect = (q.type === 'choice' && userAnswer === q.answer) ||
                    (q.type === 'truefalse' && userAnswer === q.answer);
  if (isCorrect) data.correct++;
  data.answered++;
  localStorage.setItem(DAILY_QUIZ_KEY, JSON.stringify(data));
  return data;
}

/** 获取今日问答摘要 */
function getDailyQuizSummary() {
  const data = getDailyQuiz();
  return {
    date: data.date,
    answered: data.answered,
    total: data.questions.length,
    correct: data.correct,
    completed: data.answered >= data.questions.length,
  };
}

// ==================== UI 渲染 ====================

function openDailyQuiz() {
  const modal = document.getElementById('dailyQuizModal');
  if (!modal) return;
  modal.style.display = 'flex';
  _renderDailyQuiz();
}

function closeDailyQuiz() {
  const modal = document.getElementById('dailyQuizModal');
  if (modal) modal.style.display = 'none';
}

let _dailyQuizCurrentIndex = 0;

function _renderDailyQuiz() {
  const container = document.getElementById('dailyQuizContent');
  if (!container) return;
  const data = getDailyQuiz();

  if (_dailyQuizCurrentIndex >= data.questions.length) {
    _renderDailyQuizResult(container, data);
    return;
  }

  const q = data.questions[_dailyQuizCurrentIndex];
  const isLast = _dailyQuizCurrentIndex === data.questions.length - 1;
  const progressText = `第 ${_dailyQuizCurrentIndex + 1} / ${data.questions.length} 题 · 已答对 ${data.correct} 题`;

  let answerHtml = '';
  if (q.type === 'choice') {
    answerHtml = q.options.map((opt, i) =>
      `<button class="quiz-option-btn" onclick="submitQuizAnswer(${i})">${opt}</button>`
    ).join('');
  } else {
    answerHtml = `
      <button class="quiz-option-btn" onclick="submitQuizAnswer(true)">✓ 正确</button>
      <button class="quiz-option-btn" onclick="submitQuizAnswer(false)">✗ 错误</button>
    `;
  }

  // 如果已答过，显示结果
  let resultHtml = '';
  if (q.userAnswer !== null) {
    const isCorrect = (q.type === 'choice' && q.userAnswer === q.answer) ||
                      (q.type === 'truefalse' && q.userAnswer === q.answer);
    resultHtml = `
      <div class="quiz-result ${isCorrect ? 'correct' : 'wrong'}">
        ${isCorrect ? '✓ 回答正确！' : '✗ 回答错误'}
        ${!isCorrect && q.type === 'choice' ? `<div class="quiz-correct-answer">正确答案：${q.options[q.answer]}</div>` : ''}
        ${!isCorrect && q.type === 'truefalse' ? `<div class="quiz-correct-answer">正确答案：${q.answer ? '正确' : '错误'}</div>` : ''}
        <button class="quiz-next-btn" onclick="nextQuizQuestion()">${isLast ? '查看结果' : '下一题 →'}</button>
      </div>
    `;
    answerHtml = '';
  }

  container.innerHTML = `
    <div class="quiz-progress">${progressText}</div>
    <div class="quiz-question">${q.question}</div>
    <div class="quiz-options">${answerHtml}</div>
    ${resultHtml}
  `;
}

function submitQuizAnswer(answer) {
  const data = submitDailyQuizAnswer(_dailyQuizCurrentIndex, answer);
  if (data) _renderDailyQuiz();
}

function nextQuizQuestion() {
  _dailyQuizCurrentIndex++;
  _renderDailyQuiz();
}

function _renderDailyQuizResult(container, data) {
  const total = data.questions.length;
  const correct = data.correct;
  const pct = Math.round((correct / total) * 100);
  const grade = pct >= 80 ? '🏆 文物专家！' : pct >= 60 ? '📚 历史爱好者' : pct >= 40 ? '🔍 初窥门径' : '📖 继续努力';

  container.innerHTML = `
    <div class="quiz-result-summary">
      <div class="quiz-result-grade">${grade}</div>
      <div class="quiz-result-score">${correct} / ${total}</div>
      <div class="quiz-result-pct">正确率 ${pct}%</div>
      <div class="quiz-result-date">📅 ${data.date}</div>
      <button class="quiz-restart-btn" onclick="_dailyQuizCurrentIndex = 0; _renderDailyQuiz();">重新查看</button>
    </div>
  `;
}

console.log('[DailyQuiz] 模块已加载');
