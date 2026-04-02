#!/usr/bin/env python
"""Prepare a unified manipulation-detection dataset from selected Hugging Face sources.

Pipeline characteristics:
- Streaming-first for both probing and processing.
- Schema probing only inspects first N samples via itertools.islice.
- Falls back to train[:N] / train[start:end] only if streaming is unsupported.
- Never loads a full dataset during probing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
from collections import Counter
from dataclasses import dataclass
from itertools import islice
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Optional, Sequence, Tuple

from datasketch import MinHash, MinHashLSH
from datasets import load_dataset
from langdetect import DetectorFactory, detect_langs

DetectorFactory.seed = 0


@dataclass(frozen=True)
class DatasetSpec:
    name: str
    channel: str
    domain: str
    max_keep: int


TARGET_DATASETS: List[DatasetSpec] = [
    DatasetSpec("puyang2025/seven-phishing-email-datasets", "email", "email", 50_000),
    DatasetSpec("locuoco/the-biggest-spam-ham-phish-email-dataset-300000", "email", "email", 50_000),
    DatasetSpec("tasksource/CLAIR_email_fraud", "email", "email", 35_000),
    DatasetSpec("cybersectony/PhishingEmailDetectionv2.0", "email", "email", 30_000),
    DatasetSpec("corbt/enron-emails", "email", "email", 50_000),
    DatasetSpec("SetFit/enron_spam", "email", "email", 35_000),
    DatasetSpec("zefang-liu/phishing-email-dataset", "email", "email", 25_000),
    DatasetSpec("ucirvine/sms_spam", "sms", "email", 5_000),
    DatasetSpec("Anthropic/persuasion", "email", "email", 4_000),
    DatasetSpec("magnea/fake-news-formated", "news", "news", 40_000),
]

SUBJECT_CANDIDATES = [
    "subject",
    "title",
    "headline",
    "claim",
]

BODY_CANDIDATES = [
    "body",
    "text",
    "message",
    "content",
    "sms",
    "argument",
    "Email Text",
]

LABEL_CANDIDATES = [
    "label",
    "label_text",
    "classification",
    "Email Type",
]

STOPWORDS = {
    "the",
    "and",
    "is",
    "to",
    "of",
    "for",
    "in",
    "on",
    "with",
    "this",
    "that",
    "your",
    "you",
    "we",
}

RE_TOKEN = re.compile(r"[a-z0-9]+")
RE_WS = re.compile(r"\s+")
RE_URL_ONLY = re.compile(r"^(https?://|www\.)[^\s]+/?$", re.IGNORECASE)


def safe_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
        return " ".join(safe_text(v) for v in value)
    return str(value)


def normalize_text(text: str) -> str:
    text = text.lower().strip()
    text = RE_WS.sub(" ", text)
    return text


def is_url_only(text: str) -> bool:
    return bool(RE_URL_ONLY.match(text.strip()))


def quality_filter(subject: str, body: str) -> bool:
    merged = f"{subject} {body}".strip()
    if len(merged) < 40:
        return False
    if len(merged) > 20_000:
        return False
    letters = sum(ch.isalpha() for ch in merged)
    if letters < 20:
        return False
    return True


def is_probably_english(text: str) -> bool:
    if not text or len(text) < 30:
        return False
    sample = text[:1200]
    letters = [ch for ch in sample if ch.isalpha()]
    if not letters:
        return False
    latin = sum("a" <= ch.lower() <= "z" for ch in letters)
    latin_ratio = latin / len(letters)
    if latin_ratio < 0.75:
        return False

    tokens = RE_TOKEN.findall(sample.lower())
    if len(tokens) >= 8:
        stop_hits = sum(tok in STOPWORDS for tok in tokens)
        if stop_hits >= 2:
            return True

    try:
        langs = detect_langs(sample)
        if not langs:
            return False
        top = langs[0]
        return top.lang == "en" and top.prob >= 0.80
    except Exception:
        return False


def choose_best_column(samples: List[dict], preferred: List[str], kind: str) -> Optional[str]:
    if not samples:
        return None

    keys = set()
    for row in samples:
        keys.update(row.keys())

    for cand in preferred:
        if cand in keys:
            return cand

    best_key = None
    best_score = -1.0
    for key in keys:
        values = [safe_text(row.get(key, "")) for row in samples]
        non_empty = [v for v in values if v.strip()]
        if not non_empty:
            continue
        avg_len = sum(len(v) for v in non_empty) / len(non_empty)
        uniq = len(set(non_empty))
        if kind == "label":
            # Prefer low-cardinality textual/numeric columns for labels.
            score = 500.0 / max(1, uniq) + (10.0 if uniq <= 8 else 0.0)
        elif kind == "subject":
            score = (10.0 if avg_len <= 200 else 0.0) + min(avg_len, 220.0)
        else:
            score = avg_len
        if score > best_score:
            best_score = score
            best_key = key
    return best_key


def probe_schema(spec: DatasetSpec, probe_samples: int) -> Tuple[dict, str]:
    mode = "streaming"
    samples: List[dict] = []
    try:
        ds = load_dataset(spec.name, split="train", streaming=True)
        samples = list(islice(ds, probe_samples))
    except Exception:
        mode = "slice"
        ds = load_dataset(spec.name, split=f"train[:{probe_samples}]")
        samples = list(ds)

    subject_col = choose_best_column(samples, SUBJECT_CANDIDATES, "subject")
    body_col = choose_best_column(samples, BODY_CANDIDATES, "body")
    label_col = choose_best_column(samples, LABEL_CANDIDATES, "label")

    if body_col is None:
        raise RuntimeError(f"Unable to detect body column for {spec.name}")

    schema = {
        "subject_col": subject_col,
        "body_col": body_col,
        "label_col": label_col,
    }
    return schema, mode


def stream_rows(spec: DatasetSpec, mode: str, batch_size: int) -> Iterator[List[dict]]:
    if mode == "streaming":
        iterator = load_dataset(spec.name, split="train", streaming=True)
        it = iter(iterator)
        while True:
            batch = list(islice(it, batch_size))
            if not batch:
                break
            yield batch
        return

    # Fallback: chunked split slicing if streaming is unsupported.
    start = 0
    while True:
        chunk = load_dataset(spec.name, split=f"train[{start}:{start + batch_size}]")
        if len(chunk) == 0:
            break
        yield list(chunk)
        if len(chunk) < batch_size:
            break
        start += batch_size


def label_from_row(spec: DatasetSpec, row: dict, label_col: Optional[str]) -> Optional[int]:
    if spec.name == "corbt/enron-emails":
        return 0
    if spec.name == "Anthropic/persuasion":
        return 1

    value = row.get(label_col) if label_col else None
    raw = safe_text(value).strip().lower()

    if spec.name == "magnea/fake-news-formated":
        if raw in {"fake", "false", "misleading"}:
            return 1
        if raw in {"real", "true"}:
            return 0
    if spec.name == "tasksource/CLAIR_email_fraud":
        if "fraud" in raw or "scam" in raw:
            return 1
        if raw in {"ham", "legit", "legitimate", "safe", "real"}:
            return 0
    if spec.name == "zefang-liu/phishing-email-dataset":
        if "safe" in raw or "legit" in raw:
            return 0
        if "phish" in raw or "spam" in raw:
            return 1
    if spec.name == "SetFit/enron_spam":
        if "ham" in raw or "not spam" in raw:
            return 0
        if "spam" in raw:
            return 1

    if raw:
        if any(k in raw for k in ["safe", "ham", "legit", "real", "benign"]):
            return 0
        if any(k in raw for k in ["spam", "phish", "fraud", "scam", "fake", "malicious"]):
            return 1

    # Numeric fallback.
    if value is not None:
        try:
            num = int(float(value))
            if spec.name in {
                "puyang2025/seven-phishing-email-datasets",
                "locuoco/the-biggest-spam-ham-phish-email-dataset-300000",
                "ucirvine/sms_spam",
                "SetFit/enron_spam",
            }:
                return 0 if num == 0 else 1
            if spec.name == "cybersectony/PhishingEmailDetectionv2.0":
                # Conservative mapping for this mixed class dataset.
                return 0 if num == 0 else 1
            return 0 if num == 0 else 1
        except Exception:
            pass
    return None


def infer_multi_labels(spec: DatasetSpec, label_binary: int, text: str) -> List[str]:
    text_l = text.lower()
    labels: List[str] = []

    if label_binary == 0:
        if spec.channel == "news":
            return ["legitimate_news"]
        return ["legitimate_communication"]

    if spec.name == "Anthropic/persuasion":
        labels.append("persuasion_influence")
    elif spec.name == "tasksource/CLAIR_email_fraud":
        labels.extend(["financial_scam", "identity_deception"])
    elif spec.channel == "news":
        labels.append("deceptive_news_or_misinformation")
    else:
        labels.append("spam_or_phishing")

    if any(k in text_l for k in ["urgent", "immediately", "asap", "expires", "deadline", "final notice"]):
        labels.append("fear_urgency")
    if any(k in text_l for k in ["ceo", "manager", "bank", "irs", "government", "compliance"]):
        labels.append("authority_impersonation")
    if any(k in text_l for k in ["payment", "invoice", "wire", "transfer", "refund", "account number"]):
        labels.append("financial_scam")
    if any(k in text_l for k in ["verify account", "password", "login", "identity", "ssn"]):
        labels.append("identity_deception")
    if any(k in text_l for k in ["convince", "persuade", "support this", "donate", "believe"]):
        labels.append("persuasion_influence")

    return sorted(set(labels))


def build_minhash(text: str, num_perm: int = 64) -> MinHash:
    tokens = RE_TOKEN.findall(text.lower())
    if not tokens:
        tokens = [text.lower()]
    shingles: List[str]
    if len(tokens) >= 3:
        shingles = [" ".join(tokens[i : i + 3]) for i in range(len(tokens) - 2)]
    else:
        shingles = tokens

    mh = MinHash(num_perm=num_perm)
    for item in set(shingles):
        mh.update(item.encode("utf-8"))
    return mh


def split_records(records: List[dict], seed: int) -> Tuple[List[dict], List[dict], List[dict]]:
    by_label: Dict[int, List[dict]] = {0: [], 1: []}
    for r in records:
        by_label[int(r["label_binary"])].append(r)

    rng = random.Random(seed)
    train: List[dict] = []
    val: List[dict] = []
    test: List[dict] = []

    for label in (0, 1):
        items = by_label[label]
        rng.shuffle(items)
        n = len(items)
        n_train = int(n * 0.8)
        n_val = int(n * 0.1)
        train.extend(items[:n_train])
        val.extend(items[n_train : n_train + n_val])
        test.extend(items[n_train + n_val :])

    rng.shuffle(train)
    rng.shuffle(val)
    rng.shuffle(test)
    return train, val, test


def write_jsonl(path: Path, rows: Iterable[dict]) -> int:
    count = 0
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="prepared_manipulation_dataset")
    parser.add_argument("--probe-samples", type=int, default=1000)
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--target-per-class", type=int, default=40_000)
    parser.add_argument("--pool-multiplier", type=int, default=4)
    parser.add_argument("--dedupe-threshold", type=float, default=0.88)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    rng = random.Random(args.seed)
    schemas: Dict[str, dict] = {}
    modes: Dict[str, str] = {}

    for spec in TARGET_DATASETS:
        schema, mode = probe_schema(spec, args.probe_samples)
        schemas[spec.name] = schema
        modes[spec.name] = mode
        print(f"[probe] {spec.name} mode={mode} schema={schema}")

    lsh = MinHashLSH(threshold=args.dedupe_threshold, num_perm=64)
    dedupe_counter = 0
    seen_id = 0

    legit: List[dict] = []
    manip: List[dict] = []
    seen_legit = 0
    seen_manip = 0
    pool_limit = max(args.target_per_class * args.pool_multiplier, args.target_per_class)
    kept_by_source: Counter = Counter()
    drop_stats: Counter = Counter()

    for spec in TARGET_DATASETS:
        schema = schemas[spec.name]
        mode = modes[spec.name]
        kept_this_source = 0

        for batch in stream_rows(spec, mode, args.batch_size):
            for row in batch:
                if kept_this_source >= spec.max_keep:
                    break

                if schema["subject_col"] and schema["subject_col"] != schema["body_col"]:
                    subject = safe_text(row.get(schema["subject_col"]))
                else:
                    subject = ""
                body = safe_text(row.get(schema["body_col"], ""))
                if not body.strip() and subject.strip():
                    body = subject

                if not quality_filter(subject, body):
                    drop_stats["quality"] += 1
                    continue
                if is_url_only(body):
                    drop_stats["url_only"] += 1
                    continue

                merged = normalize_text(f"{subject}\n{body}")
                if not is_probably_english(merged):
                    drop_stats["non_english"] += 1
                    continue

                label_binary = label_from_row(spec, row, schema["label_col"])
                if label_binary is None:
                    drop_stats["unknown_label"] += 1
                    continue

                mh = build_minhash(merged)
                near = lsh.query(mh)
                if near:
                    dedupe_counter += 1
                    drop_stats["dedupe"] += 1
                    continue

                uid = hashlib.sha1(f"{spec.name}:{seen_id}:{merged[:500]}".encode("utf-8")).hexdigest()
                lsh.insert(uid, mh)
                seen_id += 1

                record = {
                    "id": uid,
                    "source": spec.name,
                    "channel": spec.channel,
                    "subject": subject.strip(),
                    "body": body.strip(),
                    "label_binary": int(label_binary),
                    "label_multi": infer_multi_labels(spec, int(label_binary), merged),
                }

                if record["label_binary"] == 0:
                    seen_legit += 1
                    if len(legit) < pool_limit:
                        legit.append(record)
                        kept_this_source += 1
                    else:
                        j = rng.randint(0, seen_legit - 1)
                        if j < pool_limit:
                            legit[j] = record
                            kept_this_source += 1
                else:
                    seen_manip += 1
                    if len(manip) < pool_limit:
                        manip.append(record)
                        kept_this_source += 1
                    else:
                        j = rng.randint(0, seen_manip - 1)
                        if j < pool_limit:
                            manip[j] = record
                            kept_this_source += 1

            if kept_this_source >= spec.max_keep:
                break

        kept_by_source[spec.name] = kept_this_source
        print(
            f"[process] {spec.name} kept={kept_this_source} legit={len(legit)} manip={len(manip)} mode={mode}"
        )

    n = min(len(legit), len(manip), args.target_per_class)
    if n == 0:
        raise RuntimeError("No usable records after filtering; adjust filters or target sizes.")

    rng.shuffle(legit)
    rng.shuffle(manip)
    balanced = legit[:n] + manip[:n]
    rng.shuffle(balanced)

    train, val, test = split_records(balanced, args.seed)

    total_path = out_dir / "all_balanced.jsonl"
    train_path = out_dir / "train.jsonl"
    val_path = out_dir / "validation.jsonl"
    test_path = out_dir / "test.jsonl"
    stats_path = out_dir / "stats.json"
    schema_path = out_dir / "schema_detection.json"

    total_count = write_jsonl(total_path, balanced)
    train_count = write_jsonl(train_path, train)
    val_count = write_jsonl(val_path, val)
    test_count = write_jsonl(test_path, test)

    with schema_path.open("w", encoding="utf-8") as f:
        json.dump({"schemas": schemas, "modes": modes}, f, indent=2)

    stats = {
        "total_balanced": total_count,
        "train": train_count,
        "validation": val_count,
        "test": test_count,
        "label_distribution": dict(Counter(r["label_binary"] for r in balanced)),
        "kept_by_source": dict(kept_by_source),
        "drops": dict(drop_stats),
        "deduplicated": dedupe_counter,
        "target_per_class": args.target_per_class,
    }
    with stats_path.open("w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)

    print("[done] output_dir=", out_dir.resolve())
    print("[done] stats=", json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
