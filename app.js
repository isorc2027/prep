import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  setPersistence,
  signInWithEmailLink,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const chapters = window.PREP_DATA || [];
const byId = new Map(chapters.map((chapter) => [String(chapter.id), chapter]));
const config = window.PREP_CONFIG || {};
const OPTION_LETTERS = ["A", "B", "C", "D"];
const firebaseConfigured = Boolean(
  config.firebase?.apiKey &&
  config.firebase?.authDomain &&
  config.firebase?.projectId &&
  config.firebase?.appId &&
  !config.firebase.apiKey.startsWith("REPLACE_")
);
const emailConfigured = Boolean(
  config.emailjs?.publicKey &&
  config.emailjs?.serviceId &&
  config.emailjs?.templateId &&
  !config.emailjs.publicKey.startsWith("REPLACE_")
);
let auth = null;
let authUser = null;
let authError = "";
let authReady = Promise.resolve(null);
let lastAnswerPositions = null;

function shuffleInPlace(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[otherIndex]] = [items[otherIndex], items[index]];
  }
  return items;
}

function prepareAttemptQuestions(questions, previousPositions = null) {
  const positions = shuffleInPlace(
    questions.flatMap((_, index) => [OPTION_LETTERS[index % OPTION_LETTERS.length]])
  );
  if (previousPositions?.length === questions.length && questions.length > 0) {
    const rotation = 1 + Math.floor(Math.random() * (OPTION_LETTERS.length - 1));
    positions.forEach((_, index) => {
      const previousIndex = OPTION_LETTERS.indexOf(previousPositions[index]);
      positions[index] = OPTION_LETTERS[(previousIndex + rotation) % OPTION_LETTERS.length];
    });
  }

  const prepared = questions.map((question, index) => {
    const correctOption = question.options.find((option) => option.letter === question.answer);
    if (!correctOption || question.options.length !== OPTION_LETTERS.length) {
      throw new Error(`Question ${question.number} does not have four valid answer options.`);
    }

    const distractors = shuffleInPlace(
      question.options.filter((option) => option.letter !== question.answer)
    );
    const answerIndex = OPTION_LETTERS.indexOf(positions[index]);
    const arranged = [...distractors];
    arranged.splice(answerIndex, 0, correctOption);

    return {
      ...question,
      options: arranged.map((option, optionIndex) => ({
        ...option,
        letter: OPTION_LETTERS[optionIndex]
      })),
      answer: positions[index]
    };
  });

  return { questions: prepared, answerPositions: positions };
}

window.PREP_TEST_UTILS = { prepareAttemptQuestions };

function getChapterId() {
  return new URLSearchParams(window.location.search).get("chapter");
}

function chapterLabel(chapter) {
  return chapter.id === 0 ? "Introduction" : `Chapter ${chapter.id}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fillChapterPicker(select, selectedId) {
  if (!select) return;
  select.innerHTML = chapters.map((chapter) => {
    const selected = String(chapter.id) === String(selectedId) ? " selected" : "";
    return `<option value="${chapter.id}"${selected}>${escapeHtml(chapterLabel(chapter))}: ${escapeHtml(chapter.title)}</option>`;
  }).join("");
}

function updateAccountStatus(user) {
  const status = document.getElementById("account-status");
  if (!status) return;
  if (user) {
    status.innerHTML = `<span class="signed-in-label">Signed in as ${escapeHtml(user.displayName || user.email || "learner")}</span> <button class="sign-out-button" type="button" id="sign-out">Sign out</button>`;
    document.getElementById("sign-out")?.addEventListener("click", async () => {
      await signOut(auth);
      window.location.reload();
    });
  } else {
    status.textContent = "Open practice mode";
  }
}

async function initializeAuth() {
  if (!firebaseConfigured) {
    authError = "";
    authReady = Promise.resolve(null);
    updateAccountStatus(null);
    return null;
  }
  try {
    const firebaseApp = initializeApp(config.firebase);
    auth = getAuth(firebaseApp);
    await setPersistence(auth, browserLocalPersistence);
    if (window.emailjs && emailConfigured) {
      window.emailjs.init({ publicKey: config.emailjs.publicKey });
    }

    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = localStorage.getItem("prepEmailForSignIn");
      if (!email) email = window.prompt("Confirm the email address that received your sign-in link.");
      if (!email) throw new Error("Email link sign-in needs the email address that received the link.");
      const credential = await signInWithEmailLink(auth, email, window.location.href);
      const displayName = localStorage.getItem("prepNameForSignIn");
      if (displayName && !credential.user.displayName) {
        await updateProfile(credential.user, { displayName });
      }
      localStorage.removeItem("prepEmailForSignIn");
      localStorage.removeItem("prepNameForSignIn");
      const returnTo = localStorage.getItem("prepReturnTo");
      localStorage.removeItem("prepReturnTo");
      if (returnTo && window.location.pathname + window.location.search !== returnTo) {
        window.location.replace(returnTo);
        return null;
      }
      const cleanUrl = new URL(window.location.href);
      ["apiKey", "mode", "oobCode", "continueUrl", "lang"].forEach((key) => cleanUrl.searchParams.delete(key));
      window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    }

    authReady = new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        authUser = user;
        updateAccountStatus(user);
        unsubscribe();
        resolve(user);
      }, reject);
    });
    return await authReady;
  } catch (error) {
    authError = error.message || "Sign-in could not be initialized.";
    updateAccountStatus(null);
    return null;
  }
}

function showRegistration(shell, onSignedIn) {
  shell.innerHTML = `
    <section class="registration-panel">
      <div class="registration-copy">
        <p class="eyebrow eyebrow-dark">Your study account</p>
        <h2>Sign in to take this test.</h2>
        <p>Register with your name and email. We will email you a secure sign-in link, then send your score and review notes to that address when you finish a test.</p>
        <p class="privacy-note">No password is needed. Your test reports are sent only to the email address you sign in with.</p>
      </div>
      <form class="registration-form" id="registration-form">
        <label for="register-name">Your name</label>
        <input id="register-name" name="name" type="text" autocomplete="name" maxlength="80" required placeholder="Name">
        <label for="register-email">Email address</label>
        <input id="register-email" name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com">
        <button class="button button-primary" id="send-sign-in-link" type="submit">Email me a sign-in link <span aria-hidden="true">→</span></button>
        <p class="form-status" id="registration-status" aria-live="polite">${escapeHtml(authError)}</p>
        <p class="form-small">Already registered? Use the same form and we will send another link.</p>
      </form>
    </section>`;

  const form = document.getElementById("registration-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("send-sign-in-link");
    const status = document.getElementById("registration-status");
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const name = String(formData.get("name") || "").trim();
    if (!auth) {
      status.textContent = authError || "Sign-in is not configured.";
      status.className = "form-status is-error";
      return;
    }
    button.disabled = true;
    status.textContent = "Sending your secure sign-in link…";
    status.className = "form-status";
    try {
      const returnTo = window.location.pathname + window.location.search;
      localStorage.setItem("prepEmailForSignIn", email);
      localStorage.setItem("prepNameForSignIn", name);
      localStorage.setItem("prepReturnTo", returnTo);
      await sendSignInLinkToEmail(auth, email, {
        url: `${window.location.origin}${returnTo}`,
        handleCodeInApp: true
      });
      status.textContent = `Link sent to ${email}. Open it in this browser to continue.`;
      status.className = "form-status is-success";
    } catch (error) {
      localStorage.removeItem("prepEmailForSignIn");
      localStorage.removeItem("prepNameForSignIn");
      localStorage.removeItem("prepReturnTo");
      status.textContent = `We could not send the link: ${error.message}`;
      status.className = "form-status is-error";
      button.disabled = false;
    }
  });
  if (authUser) onSignedIn(authUser);
}

async function getAuthenticatedUser() {
  if (!firebaseConfigured) {
    return { email: "guest@prep.local", displayName: "Guest learner", isGuest: true };
  }
  if (!auth) return await initializeAuth();
  return authUser || await authReady;
}

function renderHome() {
  const grid = document.getElementById("chapter-grid");
  const search = document.getElementById("chapter-search");
  if (!grid || !search) return;

  function render(filter) {
    const query = filter.trim().toLocaleLowerCase();
    const filtered = chapters.filter((chapter) =>
      `${chapter.title} ${chapterLabel(chapter)}`.toLocaleLowerCase().includes(query)
    );
    if (!filtered.length) {
      grid.innerHTML = '<div class="empty-state">No matching chapter found. Try a shorter search.</div>';
      return;
    }
    grid.innerHTML = filtered.map((chapter) => {
      const label = chapterLabel(chapter);
      const queryPart = `chapter=${chapter.id}`;
      return `
        <article class="chapter-card">
          <div class="chapter-card-top">
            <span class="chapter-number">${escapeHtml(label)}</span>
            <span class="card-arrow" aria-hidden="true">↗</span>
          </div>
          <h3>${escapeHtml(chapter.title)}</h3>
          <span class="chapter-count">${chapter.questions.length} questions · ${chapter.cards.length} flashcards</span>
          <div class="card-actions">
            <a class="small-action" href="test.html?${queryPart}">Take the test</a>
            <a class="small-action secondary" href="flashcards.html?${queryPart}">Review cards</a>
          </div>
        </article>`;
    }).join("");
  }

  render("");
  search.addEventListener("input", () => render(search.value));
}

async function renderTest() {
  const shell = document.getElementById("test-app");
  const title = document.getElementById("test-title");
  const picker = document.getElementById("test-chapter");
  if (!shell || !title || !picker) return;

  let activeChapter = byId.get(getChapterId()) || chapters[0];
  try {
    const storedPositions = sessionStorage.getItem(`prep-answer-positions-${activeChapter.id}`);
    lastAnswerPositions = storedPositions ? JSON.parse(storedPositions) : null;
  } catch (error) {
    console.warn("Could not restore the last answer shuffle:", error);
    lastAnswerPositions = null;
  }
  fillChapterPicker(picker, activeChapter.id);
  picker.addEventListener("change", () => {
    window.location.href = `test.html?chapter=${encodeURIComponent(picker.value)}`;
  });

  function showWelcome() {
    title.textContent = `${chapterLabel(activeChapter)} practice test`;
    shell.innerHTML = `
      <div class="test-welcome">
        <span class="welcome-icon" aria-hidden="true">P</span>
        <p class="eyebrow eyebrow-dark">${escapeHtml(chapterLabel(activeChapter))}</p>
        <h2>${escapeHtml(activeChapter.title)}</h2>
        <p>This test has ${activeChapter.questions.length} questions. You will see the correct answer and a note immediately after each response. No registration is required to practice.</p>
        <button class="button button-primary" id="start-test" type="button">Start test <span aria-hidden="true">→</span></button>
      </div>`;
    document.getElementById("start-test").addEventListener("click", async () => {
      const user = await getAuthenticatedUser();
      startAttempt(user);
    });
  }

  function startAttempt(user) {
    const shuffled = prepareAttemptQuestions(activeChapter.questions, lastAnswerPositions);
    lastAnswerPositions = shuffled.answerPositions;
    try {
      sessionStorage.setItem(
        `prep-answer-positions-${activeChapter.id}`,
        JSON.stringify(lastAnswerPositions)
      );
    } catch (error) {
      console.warn("Could not save the answer shuffle for the next retake:", error);
    }
    const attempt = {
      user,
      questions: shuffled.questions,
      index: 0,
      correct: 0,
      responses: []
    };
    renderQuestion(attempt);
  }

  function renderQuestion(attempt) {
    const question = attempt.questions[attempt.index];
    const progress = Math.round(((attempt.index + 1) / attempt.questions.length) * 100);
    shell.innerHTML = `
      <div class="question-panel">
        <div class="question-meta">
          <span>${escapeHtml(chapterLabel(activeChapter))} · Question ${attempt.index + 1} of ${attempt.questions.length}</span>
          <span>${attempt.correct} correct so far</span>
        </div>
        <div class="progress-track" role="progressbar" aria-label="Test progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
          <div class="progress-fill" style="width:${progress}%"></div>
        </div>
        <h2 class="question-text">${escapeHtml(question.stem)}</h2>
        <div class="choices" role="group" aria-label="Answer choices">
          ${question.options.map((option) => `
            <button class="choice-button" type="button" data-choice="${escapeHtml(option.letter)}">
              <span class="choice-letter">${escapeHtml(option.letter)}</span>
              <span>${escapeHtml(option.text)}</span>
            </button>`).join("")}
        </div>
        <div id="feedback-slot" aria-live="polite"></div>
      </div>`;

    shell.querySelectorAll(".choice-button").forEach((button) => {
      button.addEventListener("click", () => submitAnswer(attempt, question, button.dataset.choice));
    });
  }

  function submitAnswer(attempt, question, chosen) {
    const correct = chosen === question.answer;
    if (correct) attempt.correct += 1;
    attempt.responses.push({ question, chosen, correct });

    shell.querySelectorAll(".choice-button").forEach((button) => {
      button.disabled = true;
      if (button.dataset.choice === question.answer) button.classList.add("is-correct");
      if (button.dataset.choice === chosen && !correct) button.classList.add("is-wrong");
    });

    const rightOption = question.options.find((option) => option.letter === question.answer);
    const slot = document.getElementById("feedback-slot");
    slot.innerHTML = `
      <div class="feedback-box ${correct ? "" : "incorrect"}">
        <p class="feedback-title">${correct ? "That is correct." : "Not quite. The correct answer is " + escapeHtml(question.answer) + "."} ${escapeHtml(rightOption ? rightOption.text : "")}</p>
        <p class="feedback-source">${question.explanationSource === "chapter" ? "Chapter explanation" : "Answer-key note"}</p>
        <p class="feedback-explanation">${escapeHtml(question.explanation)}</p>
      </div>
      <div class="question-footer">
        <span class="subtle-note">Your answer has been recorded for this attempt.</span>
        <button class="button button-primary" id="next-question" type="button">${attempt.index + 1 === attempt.questions.length ? "See your score" : "Next question"} <span aria-hidden="true">→</span></button>
      </div>`;

    document.getElementById("next-question").addEventListener("click", () => {
      attempt.index += 1;
      if (attempt.index >= attempt.questions.length) showResults(attempt);
      else renderQuestion(attempt);
    });
  }

  function focusAreas(attempt) {
    return attempt.responses
      .filter((response) => !response.correct)
      .map((response) => ({
        number: response.question.number,
        stem: response.question.stem,
        chosen: response.chosen,
        chosenText: response.question.options.find((option) => option.letter === response.chosen)?.text || "",
        answer: response.question.answer,
        answerText: response.question.options.find((option) => option.letter === response.question.answer)?.text || "",
        explanation: response.question.explanation
      }));
  }

  function emailReport(attempt, retryButton, status) {
    if (!emailConfigured || !window.emailjs) {
      status.textContent = "Email reports are not configured yet. The site owner must set up the free EmailJS account and template.";
      status.className = "email-status is-error";
      retryButton.hidden = true;
      return;
    }
    const misses = focusAreas(attempt);
    const percent = Math.round((attempt.correct / attempt.questions.length) * 100);
    const focusText = misses.length
      ? misses.map((item) => `Question ${item.number}: ${item.stem}\nYour answer: ${item.chosen}. ${item.chosenText}\nCorrect answer: ${item.answer}. ${item.answerText}\nReview note: ${item.explanation}`).join("\n\n")
      : "No missed questions. Excellent work.";
    if (!attempt.user || attempt.user.isGuest || !attempt.user.email || !emailConfigured || !window.emailjs) {
      status.textContent = "Open practice mode is active, so no email report was sent.";
      status.className = "email-status";
      retryButton.hidden = true;
      return;
    }
    const params = {
      to_email: attempt.user.email,
      to_name: attempt.user.displayName || "Learner",
      chapter_name: activeChapter.title,
      chapter_label: chapterLabel(activeChapter),
      score: String(attempt.correct),
      total_questions: String(attempt.questions.length),
      percentage: String(percent),
      completed_at: new Date().toLocaleString(),
      focus_areas: focusText,
      missed_count: String(misses.length)
    };
    retryButton.disabled = true;
    status.textContent = "Sending your report…";
    status.className = "email-status";
    window.emailjs.send(config.emailjs.serviceId, config.emailjs.templateId, params)
      .then(() => {
        status.textContent = `Your score report and focus notes were emailed to ${attempt.user.email}.`;
        status.className = "email-status is-success";
        retryButton.hidden = true;
      })
      .catch((error) => {
        console.error("EmailJS report delivery failed:", error);
        status.textContent = "The test is complete, but the report email did not send. Check your connection or retry.";
        status.className = "email-status is-error";
        retryButton.hidden = false;
        retryButton.disabled = false;
      });
  }

  function showResults(attempt) {
    const total = attempt.questions.length;
    const percentage = Math.round((attempt.correct / total) * 100);
    const historyKey = `prep-scores-${activeChapter.id}`;
    const previous = Number(localStorage.getItem(historyKey) || 0);
    if (attempt.correct > previous) localStorage.setItem(historyKey, String(attempt.correct));
    title.textContent = `${chapterLabel(activeChapter)} results`;
    const incorrect = focusAreas(attempt);
    shell.innerHTML = `
      <section class="result-panel">
        <p class="eyebrow eyebrow-dark">Test complete</p>
        <h2>${percentage >= 80 ? "Strong work." : percentage >= 50 ? "Good progress." : "Keep building your recall."}</h2>
        <div class="score-ring" aria-label="Score ${attempt.correct} out of ${total}">
          <span class="score-value">${attempt.correct}/${total}</span>
          <span class="score-caption">${percentage} percent</span>
        </div>
        <p class="result-copy">You answered ${attempt.correct} of ${total} questions correctly in ${escapeHtml(activeChapter.title)}.</p>
        <div class="email-report-box">
          <p class="email-report-title">Your report</p>
          <p class="email-status" id="email-status" aria-live="polite">Preparing your email report for ${escapeHtml(attempt.user.email)}…</p>
          <button class="button button-outline" id="retry-email" type="button" hidden>Retry sending the report</button>
        </div>
        <div class="result-actions">
          <button class="button button-primary" id="retake-test" type="button">Take this test again</button>
          <a class="button button-outline" href="flashcards.html?chapter=${activeChapter.id}">Review flashcards</a>
          <a class="button button-outline" href="./">Choose another chapter</a>
        </div>
        ${incorrect.length ? `
          <p class="focus-heading">Focus next: review these ${incorrect.length} missed ${incorrect.length === 1 ? "item" : "items"}.</p>
          <button class="review-toggle" id="review-toggle" type="button" aria-expanded="false">Show focus areas</button>
          <div class="review-list" id="review-list" hidden>
            ${incorrect.map((item) => `
              <article class="review-item">
                <strong>Question ${item.number}: ${escapeHtml(item.stem)}</strong>
                <p class="your-answer">Your answer: ${escapeHtml(item.chosen)}. ${escapeHtml(item.chosenText)}</p>
                <p>Correct answer: ${escapeHtml(item.answer)}. ${escapeHtml(item.answerText)}</p>
                <p>${escapeHtml(item.explanation)}</p>
              </article>`).join("")}
          </div>` : '<p class="result-copy">Perfect score. You got every question right.</p>'}
      </section>`;

    const retryButton = document.getElementById("retry-email");
    const emailStatus = document.getElementById("email-status");
    if (retryButton) {
      retryButton.addEventListener("click", () => emailReport(attempt, retryButton, emailStatus));
    }
    if (emailStatus) {
      emailReport(attempt, retryButton, emailStatus);
    }
    document.getElementById("retake-test").addEventListener("click", () => startAttempt(attempt.user));
    const toggle = document.getElementById("review-toggle");
    if (toggle) {
      toggle.addEventListener("click", () => {
        const review = document.getElementById("review-list");
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        toggle.textContent = expanded ? "Show focus areas" : "Hide focus areas";
        review.hidden = expanded;
      });
    }
  }

  const user = await getAuthenticatedUser();
  authUser = user;
  showWelcome();
}

function renderFlashcards() {
  const shell = document.getElementById("flash-app");
  const title = document.getElementById("flash-title");
  const picker = document.getElementById("flash-chapter");
  const testLink = document.getElementById("flash-test-link");
  if (!shell || !title || !picker || !testLink) return;

  let activeChapter = byId.get(getChapterId()) || chapters[0];
  fillChapterPicker(picker, activeChapter.id);
  picker.addEventListener("change", () => {
    window.location.href = `flashcards.html?chapter=${encodeURIComponent(picker.value)}`;
  });
  let index = 0;
  let flipped = false;

  function drawCard() {
    const card = activeChapter.cards[index];
    const label = chapterLabel(activeChapter);
    title.textContent = `${label} flashcards`;
    const content = flipped
      ? `<span class="flashcard-label">Answer · ${index + 1} of ${activeChapter.cards.length}</span>
         <span class="flashcard-content">${escapeHtml(card.answer)}
           ${card.explanation ? `<span class="flashcard-options">Review: ${escapeHtml(card.explanation)}</span>` : ""}
         </span>
         <span class="flashcard-hint">Click or press space to see the question</span>`
      : `<span class="flashcard-label">Question · ${index + 1} of ${activeChapter.cards.length}</span>
         <span class="flashcard-content">${escapeHtml(card.question)}
           ${card.options.length ? `<span class="flashcard-options">${card.options.map((option) => `<span>${escapeHtml(option.letter)}. ${escapeHtml(option.text)}</span>`).join("")}</span>` : ""}
         </span>
         <span class="flashcard-hint">Click or press space to reveal the answer</span>`;

    shell.innerHTML = `
      <div class="flash-progress" aria-hidden="true"><span style="width:${((index + 1) / activeChapter.cards.length) * 100}%"></span></div>
      <div class="flashcard ${flipped ? "is-flipped" : ""}" id="flashcard" role="button" tabindex="0" aria-label="${flipped ? "Answer" : "Question"} card. Activate to flip.">
        ${content}
      </div>
      <div class="flash-controls">
        <button class="button button-outline" id="previous-card" type="button" ${index === 0 ? "disabled" : ""}>← Previous</button>
        <span class="flash-position">Card ${index + 1} of ${activeChapter.cards.length}</span>
        <button class="button button-primary" id="next-card" type="button">${index === activeChapter.cards.length - 1 ? "Start over" : "Next card"} →</button>
      </div>`;
    const cardElement = document.getElementById("flashcard");
    cardElement.addEventListener("click", flip);
    cardElement.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        flip();
      }
    });
    document.getElementById("previous-card").addEventListener("click", () => move(-1));
    document.getElementById("next-card").addEventListener("click", () => move(1));
    testLink.innerHTML = `<a class="button button-outline" href="test.html?chapter=${activeChapter.id}">Take the ${escapeHtml(label)} test <span aria-hidden="true">→</span></a>`;
  }

  function flip() {
    flipped = !flipped;
    drawCard();
    document.getElementById("flashcard").focus();
  }

  function move(direction) {
    index = (index + direction + activeChapter.cards.length) % activeChapter.cards.length;
    flipped = false;
    drawCard();
  }

  function keyHandler(event) {
    if (event.key === "ArrowRight") move(1);
    if (event.key === "ArrowLeft" && index > 0) move(-1);
    if (event.key === " " && document.activeElement?.id !== "flashcard") {
      event.preventDefault();
      flip();
    }
  }

  document.addEventListener("keydown", keyHandler);
  drawCard();
}

async function start() {
  if (firebaseConfigured) {
    await initializeAuth();
  } else {
    updateAccountStatus(null);
  }
  if (document.body.dataset.page === "home") renderHome();
  if (document.body.dataset.page === "test") await renderTest();
  if (document.body.dataset.page === "flashcards") renderFlashcards();
}

start().catch((error) => {
  console.error("Prep could not start:", error);
  const testShell = document.getElementById("test-app");
  if (testShell) testShell.innerHTML = `<div class="test-welcome"><h2>Prep could not load.</h2><p>${escapeHtml(error.message)}</p></div>`;
});
