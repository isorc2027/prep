PREP WEBSITE

This is a static website for chapter-wise UGC-NET English practice tests and flashcards.

LOCAL PREVIEW

Start a local server from this folder:

python3 -m http.server 8000

Then open http://localhost:8000

GITHUB PAGES

The site is deployed from this repository by the included GitHub Pages Actions workflow.

REGISTRATION AND REPORT EMAILS

Account registration uses Firebase Authentication email-link sign-in. Test reports use EmailJS from the browser. The service accounts and sender identity must be configured by the site owner before registration or email reports work. Follow EMAIL_SETUP.txt.

firebase-config.js contains placeholders, not real project settings. Firebase web configuration and the EmailJS public key are intended for client-side use; do not put email-service private credentials or passwords in this file. Restrict EmailJS permitted origins and template settings to the site domain. Provider free tiers and limits can change.

QUESTION COUNTS, ANSWERS, AND EXPLANATIONS

Question counts follow the source chapter files. Some chapters contain 50 questions and others contain 100. Answer choices are shuffled for each test attempt, with balanced correct-answer positions. The Introduction includes detailed source explanations. For other chapters, the source files provide answer keys but do not include question-by-question rationales; the site clearly labels the feedback as an answer-key note and includes missed questions and their supplied facts in the report.

To rebuild the bundled question data after updating the source markdown files, run:

python3 build_data.py
