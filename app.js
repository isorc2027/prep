(function () {
  "use strict";

  const chapters = window.PREP_DATA || [];
  const byId = new Map(chapters.map((chapter) => [String(chapter.id), chapter]));

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

  function renderTest() {
    const shell = document.getElementById("test-app");
    const title = document.getElementById("test-title");
    const picker = document.getElementById("test-chapter");
    if (!shell || !title || !picker) return;

    let activeChapter = byId.get(getChapterId());
    if (!activeChapter) activeChapter = chapters[0];
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
          <p>This test has ${activeChapter.questions.length} questions. Choose one answer at a time to see the correct answer and a note immediately after each response. The Introduction has detailed source explanations; other notes are based on the answer key supplied with the chapter questions.</p>
          <button class="button button-primary" id="start-test" type="button">Start test <span aria-hidden="true">→</span></button>
        </div>`;
      document.getElementById("start-test").addEventListener("click", startAttempt);
    }

    function startAttempt() {
      title.textContent = `${chapterLabel(activeChapter)} practice test`;
      const attempt = {
        questions: activeChapter.questions,
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

    function showResults(attempt) {
      const total = attempt.questions.length;
      const percentage = Math.round((attempt.correct / total) * 100);
      const historyKey = `prep-scores-${activeChapter.id}`;
      const previous = Number(localStorage.getItem(historyKey) || 0);
      if (attempt.correct > previous) localStorage.setItem(historyKey, String(attempt.correct));
      title.textContent = `${chapterLabel(activeChapter)} results`;
      const incorrect = attempt.responses.filter((response) => !response.correct);
      shell.innerHTML = `
        <section class="result-panel">
          <p class="eyebrow eyebrow-dark">Test complete</p>
          <h2>${percentage >= 80 ? "Strong work." : percentage >= 50 ? "Good progress." : "Keep building your recall."}</h2>
          <div class="score-ring" aria-label="Score ${attempt.correct} out of ${total}">
            <span class="score-value">${attempt.correct}/${total}</span>
            <span class="score-caption">${percentage} percent</span>
          </div>
          <p class="result-copy">You answered ${attempt.correct} of ${total} questions correctly in ${escapeHtml(activeChapter.title)}.</p>
          <div class="result-actions">
            <button class="button button-primary" id="retake-test" type="button">Take this test again</button>
            <a class="button button-outline" href="flashcards.html?chapter=${activeChapter.id}">Review flashcards</a>
            <a class="button button-outline" href="./">Choose another chapter</a>
          </div>
          ${incorrect.length ? `
            <button class="review-toggle" id="review-toggle" type="button" aria-expanded="false">Review ${incorrect.length} missed ${incorrect.length === 1 ? "question" : "questions"}</button>
            <div class="review-list" id="review-list" hidden>
              ${incorrect.map((response) => {
                const right = response.question.options.find((option) => option.letter === response.question.answer);
                const selected = response.question.options.find((option) => option.letter === response.chosen);
                return `<article class="review-item">
                  <strong>${escapeHtml(response.question.stem)}</strong>
                  <p class="your-answer">Your answer: ${escapeHtml(response.chosen)}. ${escapeHtml(selected ? selected.text : "")}</p>
                  <p>Correct answer: ${escapeHtml(response.question.answer)}. ${escapeHtml(right ? right.text : "")}</p>
                  <p>${escapeHtml(response.question.explanation)}</p>
                </article>`;
              }).join("")}
            </div>` : '<p class="result-copy">Perfect score. You got every question right.</p>'}
        </section>`;
      document.getElementById("retake-test").addEventListener("click", startAttempt);
      const toggle = document.getElementById("review-toggle");
      if (toggle) {
        toggle.addEventListener("click", () => {
          const review = document.getElementById("review-list");
          const expanded = toggle.getAttribute("aria-expanded") === "true";
          toggle.setAttribute("aria-expanded", String(!expanded));
          toggle.textContent = expanded ? `Review ${incorrect.length} missed ${incorrect.length === 1 ? "question" : "questions"}` : "Hide question review";
          review.hidden = expanded;
        });
      }
    }

    showWelcome();
  }

  function renderFlashcards() {
    const shell = document.getElementById("flash-app");
    const title = document.getElementById("flash-title");
    const picker = document.getElementById("flash-chapter");
    const testLink = document.getElementById("flash-test-link");
    if (!shell || !title || !picker || !testLink) return;

    let activeChapter = byId.get(getChapterId());
    if (!activeChapter) activeChapter = chapters[0];
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
           <span class="flashcard-content">${escapeHtml(card.answer)}</span>
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

  const page = document.body.dataset.page;
  if (page === "home") renderHome();
  if (page === "test") renderTest();
  if (page === "flashcards") renderFlashcards();
})();
