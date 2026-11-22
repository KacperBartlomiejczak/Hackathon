import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "eval"))

from analyze_gold import gold_urls, split_by_presence

from app.eval import url_hash


def test_split_by_presence_separates_missing_urls() -> None:
    urls = ["https://a.example/1", "https://b.example/2"]
    found, missing = split_by_presence(urls, {url_hash(urls[0]): 7})
    assert found == {urls[0]: 7}
    assert missing == [urls[1]]


def test_gold_urls_are_unique_and_cover_all_modules() -> None:
    urls = gold_urls()
    assert urls and len(urls) == len(set(urls))
