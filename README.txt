PREP WEBSITE

This is a static website for chapter-wise UGC-NET English practice tests and flashcards.

LOCAL PREVIEW

Open index.html in a modern browser. If your browser blocks local JavaScript files, start a local server from this folder:

python3 -m http.server 8000

Then open http://localhost:8000

GITHUB PAGES

The folder is ready to use as the contents of a repository named prep. Create a repository, upload the contents of this folder to its root, and select GitHub Actions as the Pages deployment source in repository settings. The included Pages workflow publishes the static files.

The website does not require a server, database, API key, or external runtime. Test scores are stored only in the visitor's browser.

QUESTION COUNTS AND EXPLANATIONS

Question counts follow the source chapter files. Some chapters contain 50 questions and others contain 100. The Introduction includes detailed source explanations. For other chapters, the source files provide answer keys but do not include question-by-question rationales; the site gives a transparent answer-key note with the correct option and fact being tested.

To rebuild the bundled question data after updating the source markdown files, run:

python3 build_data.py
