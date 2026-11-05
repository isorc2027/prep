#!/usr/bin/env python3
"""Build the static question data from the chapter markdown files."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(__file__).resolve().parent / "data" / "questions.js"
SOURCE_FILES = {
    0: "UGC_NET_Ch00_Introduction.md",
    1: "UGC_NET_Ch01_RammohanRay.md",
    2: "UGC_NET_Ch02_HinduCollege.md",
    3: "UGC_NET_Ch03_DuttFamily.md",
    4: "UGC_NET_Ch04_Kipling.md",
    5: "UGC_NET_Ch05_MalabariTripathi.md",
    6: "UGC_NET_Ch06_IndianNovel.md",
    7: "UGC_NET_Ch07_Tagore.md",
    8: "UGC_NET_Ch08_09_AurobindoNaidu.md",
    9: "UGC_NET_Ch08_09_AurobindoNaidu.md",
    10: "UGC_NET_Ch10_GandhiNehru.md",
    11: "UGC_NET_Ch11_VerrierElwin.md",
    12: "UGC_NET_Ch12_Novelists1930s40s.md",
    13: "UGC_NET_Ch13_RKNarayan.md",
    14: "UGC_NET_Ch14_NiradChaudhuri.md",
    15: "UGC_NET_Ch15_16_Novelists_Naipaul.md",
    16: "UGC_NET_Ch15_16_Novelists_Naipaul.md",
    17: "UGC_NET_Ch17_PoetrySinceIndependence.md",
    18: "UGC_NET_Ch18_IndianDiaspora.md",
    19: "UGC_NET_Ch19_20_RamanujanRushdie.md",
    20: "UGC_NET_Ch19_20_RamanujanRushdie.md",
    21: "UGC_NET_Ch21_AfterMidnight.md",
    22: "UGC_NET_Ch22_Dramatists.md",
    23: "UGC_NET_Ch23_FiveNatureWriters.md",
    24: "UGC_NET_Ch24_TranslationsIntoEnglish.md",
}


def plain(text: str) -> str:
    text = text.replace("**", "").replace("*", "").replace("`", "").replace("#", "")
    return re.sub(r"\s+", " ", text).strip()


def display_title(text: str) -> str:
    return re.sub(r"(\d+)S\b", r"\1s", text.title())


def parse_options(body: str) -> tuple[str, list[dict[str, str]]]:
    markers = list(re.finditer(r"(?<![A-Za-z0-9])([A-D])\)\s+", body))
    for index, marker in enumerate(markers):
        group = markers[index : index + 4]
        if marker.group(1) != "A" or [item.group(1) for item in group] != list("ABCD"):
            continue
        options = []
        for option_index, option in enumerate(group):
            end = group[option_index + 1].start() if option_index < 3 else len(body)
            options.append({
                "letter": option.group(1),
                "text": plain(body[option.end() : end]),
            })
        return plain(body[: marker.start()]), options
    return plain(body), []


def chapter_segments(chapter_id: int, source: str) -> list[tuple[str, str]]:
    text = (ROOT / source).read_text(encoding="utf-8")
    headings = list(re.finditer(r"(?m)^# CHAPTER\s+(\d+):\s*(.*?)\s*$", text))
    if chapter_id == 0:
        return [("Introduction", text)]
    segments = []
    for index, heading in enumerate(headings):
        number = int(heading.group(1))
        if number != chapter_id:
            continue
        end = headings[index + 1].start() if index + 1 < len(headings) else len(text)
        segments.append((plain(heading.group(2)), text[heading.start() : end]))
    return segments


def parse_answer_key(segment: str) -> dict[int, str]:
    heading = re.search(r"(?mi)^## .*?(?:ANSWER KEY|Complete Answer Key)[^\n]*", segment)
    if not heading:
        return {}
    key_text = re.split(r"(?mi)^## Supplementary Flashcards", segment[heading.end() :])[0]
    answers: dict[int, str] = {}
    for match in re.finditer(r"Q\s*(\d+)\s*[-:]\s*([A-D])\b", key_text):
        answers.setdefault(int(match.group(1)), match.group(2))
    return answers


def parse_introduction_explanations(segment: str) -> dict[int, str]:
    heading = re.search(r"(?mi)^## Detailed Explanations\s*$", segment)
    if not heading:
        return {}
    explanation_text = segment[heading.end() :]
    explanations = {}
    for match in re.finditer(r"(?m)^\s*(\d+)\.\s+\*\*([A-D])\.\*\*\s+(.+?)\s*$", explanation_text):
        explanations[int(match.group(1))] = plain(match.group(3))
    return explanations


def parse_questions(segment: str, answers: dict[int, str], explanations: dict[int, str]) -> list[dict]:
    answer_heading = re.search(r"(?mi)^## .*?(?:ANSWER KEY|Complete Answer Key)[^\n]*", segment)
    question_text = segment[: answer_heading.start()] if answer_heading else segment
    markers = list(re.finditer(r"\*\*Q(\d+)\.\*\*", question_text))
    questions = []
    for index, marker in enumerate(markers):
        end = markers[index + 1].start() if index + 1 < len(markers) else len(question_text)
        raw_body = plain(question_text[marker.end() : end])
        stem, options = parse_options(raw_body)
        number = int(marker.group(1))
        answer = answers.get(number)
        if not answer or len(options) != 4:
            continue
        answer_text = next(option["text"] for option in options if option["letter"] == answer)
        explanation = explanations.get(number)
        if explanation:
            explanation_source = "chapter"
        else:
            explanation_source = "answer-key"
            explanation = (
                f"The source question bank marks {answer}. {answer_text} as correct. "
                f"This item tests the chapter detail: {stem}"
            )
        questions.append({
            "number": number,
            "stem": stem,
            "options": options,
            "answer": answer,
            "explanation": explanation,
            "explanationSource": explanation_source,
        })
    return questions


def build() -> list[dict]:
    chapters = []
    for chapter_id in range(25):
        source = SOURCE_FILES[chapter_id]
        segments = chapter_segments(chapter_id, source)
        if not segments:
            raise ValueError(f"No source section for chapter {chapter_id}: {source}")
        title, segment = segments[0]
        title = display_title(title)
        answers = parse_answer_key(segment)
        explanations = parse_introduction_explanations(segment) if chapter_id == 0 else {}
        questions = parse_questions(segment, answers, explanations)
        if not questions:
            raise ValueError(f"No complete question and answer pairs for chapter {chapter_id}")
        selected = questions if len(questions) <= 10 else [
            questions[round(index * (len(questions) - 1) / 9)] for index in range(10)
        ]
        cards = []
        for question in selected:
            answer_option = next(
                option for option in question["options"] if option["letter"] == question["answer"]
            )
            cards.append({
                "question": question["stem"],
                "options": question["options"],
                "answer": f'{question["answer"]}. {answer_option["text"]}',
                "explanation": question["explanation"],
            })
        chapters.append({
            "id": chapter_id,
            "title": title,
            "source": source,
            "questions": questions,
            "cards": cards,
        })
    return chapters


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    chapters = build()
    OUTPUT.write_text(
        "window.PREP_DATA = " + json.dumps(chapters, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(chapters)} chapters and {sum(len(ch['questions']) for ch in chapters)} questions to {OUTPUT}")


if __name__ == "__main__":
    main()
