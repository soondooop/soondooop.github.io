async function inflateB64(b64){
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const text = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  return JSON.parse(text);
}
async function loadB64File(src){
  const t = await (await fetch(src, {cache: "no-store"})).text();
  const m = t.match(/=\s*"([^"]+)"/);
  if (!m) throw new Error("데이터 파일을 읽지 못했습니다: " + src);
  return inflateB64(m[1]);
}

let EXAM_DATA = {};
let CARDS = [];
const LS = "jungchegi-wrong-v1";
const LS_EX = "jungchegi-exam-wrong-v1";
const $ = (id) => document.getElementById(id);

let cats = [];
let examRounds = [];
let selected = new Set();
let mode = "term";
let count = 10;
let queue = [];
let i = 0;
let correct = 0;
let misses = [];
let answered = false;
let cur = null;
let app = "memo";
let examRound = "";
let examOrder = "seq";
let lastExamWrong = false;

function shuffle(a){
  const x = a.slice();
  for (let n = x.length - 1; n > 0; n--) {
    const j = Math.floor(Math.random() * (n + 1));
    [x[n], x[j]] = [x[j], x[n]];
  }
  return x;
}
function pool(){
  const list = CARDS.filter(c => selected.has(c.cat));
  return list.length ? list : CARDS;
}
function loadWrong(){
  try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch { return []; }
}
function saveWrong(ids){
  localStorage.setItem(LS, JSON.stringify([...new Set(ids)].slice(-200)));
}
function loadExamWrong(){
  try { return JSON.parse(localStorage.getItem(LS_EX) || "[]"); } catch { return []; }
}
function saveExamWrong(ids){
  localStorage.setItem(LS_EX, JSON.stringify([...new Set(ids)].slice(-400)));
}

function setTab(tab){
  app = tab;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("is-on", b.dataset.tab === tab));
  $("setup").classList.toggle("hidden", tab !== "memo");
  $("examSetup").classList.toggle("hidden", tab !== "exam");
  $("quiz").classList.add("hidden");
  $("result").classList.add("hidden");
}
document.querySelector(".tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab]");
  if (!b) return;
  if (!$("quiz").classList.contains("hidden")) return;
  setTab(b.dataset.tab);
});

function renderExamRounds(){
  const byYear = {};
  examRounds.forEach(name => {
    const y = name.slice(0, 4);
    (byYear[y] ||= []).push(name);
  });
  $("examRounds").innerHTML = Object.keys(byYear).sort().map(y => {
    const chips = byYear[y].map(name =>
      `<button class="chip ${name===examRound?"is-on":""}" data-round="${name}">${name} (${(EXAM_DATA[name]||[]).length})</button>`
    ).join("");
    return `<div class="year-lab">${y}년</div><div class="row">${chips}</div>`;
  }).join("");
}
$("examRounds").addEventListener("click", (e) => {
  const b = e.target.closest("[data-round]");
  if (!b) return;
  examRound = b.dataset.round;
  renderExamRounds();
});
$("examOrders").addEventListener("click", (e) => {
  const b = e.target.closest("[data-order]");
  if (!b) return;
  examOrder = b.dataset.order;
  [...$("examOrders").children].forEach(x => x.classList.toggle("is-on", x === b));
});

function compact(s){
  return String(s || "").toLowerCase().replace(/\s+/g, "").replace(/[()[\]{}'"`]/g, "");
}
function examAlts(official){
  return String(official || "")
    .split(/\n|\/|\bor\b|또는/i)
    .map(s => s.replace(/^\s*\d+\s*[\.．)]\s*/, "").replace(/^\s*[ㄱ-ㅎ]\s*[\.．]\s*/, "").trim())
    .filter(Boolean);
}
function gradeExam(typed, official){
  const t = compact(typed);
  if (!t) return false;
  const alts = examAlts(official).map(compact).filter(Boolean);
  if (alts.some(a => a === t)) return true;
  const o = compact(official);
  if (o && (o === t || (o.length >= 2 && (t.includes(o) || o.includes(t))))) return true;
  const long = alts.filter(a => a.length >= 2);
  if (long.length >= 2 && long.every(a => t.includes(a))) return true;
  return false;
}

function startExam(fromWrong){
  lastExamWrong = !!fromWrong;
  let src = (EXAM_DATA[examRound] || []).slice();
  if (fromWrong) {
    const ids = new Set(loadExamWrong());
    const all = examRounds.flatMap(r => EXAM_DATA[r] || []).filter(q => ids.has(q.id));
    const inRound = all.filter(q => q.round === examRound);
    src = inRound.length ? inRound : all;
    if (!src.length) { alert("저장된 기출 오답이 없습니다."); return; }
  }
  if (!src.length) { alert("이 회차 문항을 불러오지 못했습니다. exams-data.js를 같은 폴더에 두었는지 확인하세요."); return; }
  const ordered = examOrder === "rand" ? shuffle(src) : src.slice().sort((a,b) => a.n - b.n);
  queue = ordered.map(q => ({
    exam: true,
    write: true,
    card: {
      id: q.id,
      term: q.a,
      def: q.q,
      keys: "",
      ex: q.explain,
      hint: "",
      cat: q.round,
      n: q.n,
      imgs: q.imgs || [],
      src: q.src
    }
  }));
  i = 0; correct = 0; misses = [];
  $("setup").classList.add("hidden");
  $("examSetup").classList.add("hidden");
  $("result").classList.add("hidden");
  $("quiz").classList.remove("hidden");
  show();
}

function renderCats(){
  $("cats").innerHTML = `<button class="chip ${selected.size===cats.length?"is-on":""}" data-all="1">전체 ${CARDS.length}개</button>` +
    cats.map(c => {
      const n = CARDS.filter(x => x.cat === c).length;
      return `<button class="chip ${selected.has(c)?"is-on":""}" data-cat="${c}">${c} ${n}</button>`;
    }).join("");
}
$("cats").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.all) {
    selected = new Set(cats);
  } else {
    const c = b.dataset.cat;
    if (selected.size === cats.length) selected = new Set([c]);
    else if (selected.has(c) && selected.size > 1) selected.delete(c);
    else if (selected.has(c)) selected = new Set(cats);
    else selected.add(c);
  }
  renderCats();
});
$("modes").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  mode = b.dataset.mode;
  [...$("modes").children].forEach(x => x.classList.toggle("is-on", x === b));
});
$("counts").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  count = Number(b.dataset.n);
  [...$("counts").children].forEach(x => x.classList.toggle("is-on", x === b));
});

function pickChoices(card, key){
  const same = pool().filter(c => c.id !== card.id && c.cat === card.cat);
  const rest = pool().filter(c => c.id !== card.id);
  const src = shuffle(same.length >= 3 ? same : rest);
  const opts = shuffle([card, ...src.slice(0, 3)]);
  return opts.map(c => ({id: c.id, text: c[key], ok: c.id === card.id}));
}
function makeOX(card){
  const lie = shuffle(pool().filter(c => c.id !== card.id && c.cat === card.cat))[0]
    || shuffle(pool().filter(c => c.id !== card.id))[0];
  const truth = Math.random() < 0.5;
  const stmt = truth
    ? `${card.term}  →  ${card.def}`
    : `${card.term}  →  ${lie.def}`;
  return {card, ox: true, stmt, truth, choices: [
    {id: "O", text: "O (맞다)", ok: truth},
    {id: "X", text: "X (아니다)", ok: !truth}
  ]};
}
function makeItem(card){
  if (mode === "ox") return makeOX(card);
  if (mode === "write") return {card, prompt: card.def, write: true};
  if (mode === "def") {
    return {card, prompt: card.term, choices: pickChoices(card, "def")};
  }
  return {card, prompt: card.def, choices: pickChoices(card, "term")};
}

function norm(s){
  return String(s || "").toLowerCase()
    .replace(/[()[\]{}]/g, " ")
    .replace(/[^0-9a-z가-힣%+\-]/gi, "")
    .trim();
}
function aliases(card){
  const raw = [card.term, card.keys].filter(Boolean).join(" ");
  const out = new Set();
  const add = (s) => {
    const n = norm(s);
    if (n && n.length >= 2) out.add(n);
  };
  add(card.term);
  add(card.keys);
  raw.split(/[\/,;·|]/).forEach(add);
  (raw.match(/\(([^)]+)\)/g) || []).forEach(m => add(m.slice(1, -1)));
  (raw.match(/[A-Za-z][A-Za-z0-9 +\-]{1,}/g) || []).forEach(add);
  (raw.match(/[가-힣]{2,}/g) || []).forEach(add);
  return [...out];
}
function gradeWrite(answer, card){
  const a = norm(answer);
  if (!a) return false;
  return aliases(card).some(al => a === al || (a.length >= 3 && (al.includes(a) || a.includes(al))));
}

function start(fromWrong){
  let src = pool();
  if (fromWrong) {
    const ids = new Set(loadWrong());
    src = CARDS.filter(c => ids.has(c.id));
    if (!src.length) { alert("저장된 오답이 없습니다."); return; }
  }
  queue = shuffle(src).slice(0, count || src.length).map(makeItem);
  i = 0; correct = 0; misses = [];
  $("setup").classList.add("hidden");
  $("examSetup").classList.add("hidden");
  $("result").classList.add("hidden");
  $("quiz").classList.remove("hidden");
  show();
}

function modeLabel(){
  if (mode === "ox") return " · OX";
  if (mode === "def") return " · 정의 고르기";
  if (mode === "write") return " · 주관식";
  return " · 용어 고르기";
}
function show(){
  answered = false;
  cur = queue[i];
  $("pos").textContent = `${i+1} / ${queue.length}`;
  $("live").textContent = `정답 ${correct}`;
  $("bar").style.width = ((i / queue.length) * 100) + "%";
  $("markOk").classList.add("hidden");
  if (cur.exam) {
    $("qcat").textContent = `${cur.card.cat} · ${cur.card.n}번`;
    $("qtext").classList.add("is-exam");
    $("qtext").innerHTML = (cur.card.imgs || []).map(u =>
      `<img src="${escapeHtml(u)}" alt="문제 그림">`
    ).join("") + `<p>${escapeHtml(cur.card.def)}</p>`;
    $("opts").innerHTML =
      `<div class="write-box" style="flex-direction:column">
        <textarea id="ans" autocomplete="off" placeholder="답을 작성하세요. 여러 칸이면 줄을 바꿔 적어도 됩니다."></textarea>
        <button class="btn primary" id="submit">채점</button>
      </div>
      <p class="write-note">채점 전에는 답이 보이지 않습니다. 줄바꿈은 Shift+Enter, 채점은 Enter.</p>`;
  } else {
    $("qcat").textContent = cur.card.cat + modeLabel();
    $("qtext").classList.remove("is-exam");
    $("qtext").textContent = cur.ox ? cur.stmt : cur.prompt;
    if (cur.write) {
      $("opts").innerHTML =
        `<div class="write-box">
          <input id="ans" autocomplete="off" placeholder="용어를 입력하세요 (한글 또는 영문)">
          <button class="btn primary" id="submit">채점</button>
        </div>
        <p class="write-note">실기처럼 단답으로 쓰면 됩니다. Factory Method, 팩토리 메소드처럼 한글·영문 모두 인정합니다.</p>`;
    } else {
      $("opts").innerHTML = cur.choices.map((c, idx) =>
        `<button class="opt" data-i="${idx}"><b>${idx+1}.</b> ${escapeHtml(c.text)}</button>`
      ).join("");
    }
  }
  const submit = $("submit");
  if (submit) submit.onclick = submitWrite;
  setTimeout(() => { const el = $("ans"); if (el) el.focus(); }, 0);
  $("explain").classList.remove("is-on");
  $("next").classList.add("hidden");
  $("next").textContent = i === queue.length - 1 ? "결과 보기" : "다음";
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
}

function reveal(ok, typed){
  answered = true;
  if (ok) correct += 1;
  else misses.push(cur);
  const c = cur.card;
  if (cur.exam) {
    $("explain").innerHTML =
      (typed ? `<b>내 답</b> ${escapeHtml(typed).replace(/\n/g,"<br>")}<br>` : "") +
      `<b>정답</b> ${escapeHtml(c.term).replace(/\n/g,"<br>")}` +
      (c.ex ? `<br><b>해설</b> ${escapeHtml(c.ex).replace(/\n/g,"<br>")}` : "") +
      (c.src ? `<div class="src-link"><a href="${escapeHtml(c.src)}" target="_blank" rel="noopener">원문 보기</a></div>` : "");
  } else {
    $("explain").innerHTML =
      (typed ? `<b>내 답</b> ${escapeHtml(typed)}<br>` : "") +
      `<b>정답</b> ${escapeHtml(c.term)}<br>${escapeHtml(c.def)}` +
      (c.keys ? `<br><b>키워드</b> ${escapeHtml(c.keys)}` : "") +
      (c.ex ? `<br><b>예</b> ${escapeHtml(c.ex)}` : "") +
      (c.hint ? `<br><b>암기</b> ${escapeHtml(c.hint)}` : "");
  }
  $("explain").classList.add("is-on");
  $("next").classList.remove("hidden");
  if (!ok && cur.write) $("markOk").classList.remove("hidden");
}
function submitWrite(){
  if (answered) return;
  const input = $("ans");
  const typed = (input && input.value || "").trim();
  if (!typed) { if (input) input.focus(); return; }
  if (input) input.disabled = true;
  const btn = $("submit");
  if (btn) btn.disabled = true;
  const ok = cur.exam ? gradeExam(typed, cur.card.term) : gradeWrite(typed, cur.card);
  reveal(ok, typed);
}
function choose(idx){
  if (answered || !cur || cur.write) return;
  const choice = cur.choices[idx];
  const buttons = [...$("opts").querySelectorAll("button")];
  buttons.forEach((b, n) => {
    b.disabled = true;
    if (cur.choices[n].ok) b.classList.add("is-ok");
    if (n === idx && !choice.ok) b.classList.add("is-bad");
  });
  reveal(choice.ok, "");
}

function finish(){
  $("quiz").classList.add("hidden");
  $("result").classList.remove("hidden");
  const pct = Math.round((correct / queue.length) * 100) || 0;
  $("score").textContent = `${correct} / ${queue.length}`;
  $("summary").textContent = `정답률 ${pct}% · ${pct >= 80 ? "합격권입니다." : pct >= 60 ? "한 바퀴 더 보면 됩니다." : "오답부터 다시 보세요."}`;
  if (app === "exam") {
    $("miss").innerHTML = misses.length
      ? `<label class="k">오답 ${misses.length}</label>` + misses.map(m =>
          `<p style="margin:0 0 10px;font-size:14px"><b>${escapeHtml(m.card.cat)} ${m.card.n}번</b> — ${escapeHtml(m.card.term)}</p>`
        ).join("")
      : "<p>오답이 없습니다.</p>";
    const prev = loadExamWrong().filter(id => !queue.some(q => q.card.id === id && !misses.some(m => m.card.id === id)));
    saveExamWrong([...prev, ...misses.map(m => m.card.id)]);
  } else {
    $("miss").innerHTML = misses.length
      ? `<label class="k">오답 ${misses.length}</label>` + misses.map(m =>
          `<p style="margin:0 0 10px;font-size:14px"><b>${escapeHtml(m.card.term)}</b> — ${escapeHtml(m.card.def)}</p>`
        ).join("")
      : "<p>오답이 없습니다.</p>";
    const prev = loadWrong().filter(id => !queue.some(q => q.card.id === id && !misses.some(m => m.card.id === id)));
    saveWrong([...prev, ...misses.map(m => m.card.id)]);
  }
}

$("start").onclick = () => start(false);
$("wrongStart").onclick = () => start(true);
$("examStart").onclick = () => startExam(false);
$("examWrong").onclick = () => startExam(true);
$("next").onclick = () => { if (i >= queue.length - 1) finish(); else { i += 1; show(); } };
$("quit").onclick = finish;
$("again").onclick = () => { if (app === "exam") startExam(lastExamWrong); else start(false); };
$("markOk").onclick = () => {
  if (!cur || !misses.includes(cur)) return;
  misses = misses.filter(m => m !== cur);
  correct += 1;
  $("live").textContent = `정답 ${correct}`;
  $("markOk").classList.add("hidden");
};
$("home").onclick = () => {
  $("result").classList.add("hidden");
  $("quiz").classList.add("hidden");
  setTab(app);
};
$("opts").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]");
  if (b) choose(Number(b.dataset.i));
});
document.addEventListener("keydown", (e) => {
  if ($("quiz").classList.contains("hidden")) return;
  if (e.key === "Enter") {
    if (e.shiftKey && cur && cur.exam) return;
    e.preventDefault();
    if (!answered && cur && cur.write) submitWrite();
    else if (answered) $("next").click();
    return;
  }
  if (!answered && cur && !cur.write && ["1","2","3","4"].includes(e.key)) choose(Number(e.key) - 1);
});

async function boot(){
  const parts = await Promise.all([
    loadB64File("exams-2020.js"),
    loadB64File("exams-2021.js"),
    loadB64File("exams-2022.js"),
    loadB64File("exams-2023.js"),
    loadB64File("exams-2024.js"),
    loadB64File("exams-2025.js"),
    loadB64File("exams-2026.js"),
    loadB64File("cards-data.js")
  ]);
  EXAM_DATA = Object.assign({}, ...parts.slice(0, 7));
  CARDS = parts[7];
  cats = [...new Set(CARDS.map(c => c.cat))];
  examRounds = Object.keys(EXAM_DATA);
  selected = new Set(cats);
  examRound = examRounds.includes("2026년 2회") ? "2026년 2회" : (examRounds[0] || "");
  renderExamRounds();
  renderCats();
}
boot().catch((err) => {
  console.error(err);
  alert("퀴즈 데이터를 불러오지 못했습니다. 페이지를 새로고침해 주세요.");
});
