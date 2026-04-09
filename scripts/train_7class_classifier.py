#!/usr/bin/env python
"""Train a 7-class DistilBERT classifier for Tier 2 manipulation typing."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Dict, Optional

import numpy as np
import torch
import torch.nn as nn
from datasets import DatasetDict, load_dataset
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
    set_seed,
)


LABELS = [
    "Authority Exploitation",
    "Fear Induction",
    "Financial Manipulation",
    "Identity Deception",
    "Legitimate",
    "Mild Influence",
    "Urgency Manipulation",
]

LABEL2ID = {label: idx for idx, label in enumerate(LABELS)}
ID2LABEL = {idx: label for label, idx in LABEL2ID.items()}

# Priority order: first match wins.
PRIORITY_MAPPING = [
    ("fear_urgency", "Fear Induction"),
    ("authority_impersonation", "Authority Exploitation"),
    ("financial_scam", "Financial Manipulation"),
    ("identity_deception", "Identity Deception"),
    ("persuasion_influence", "Mild Influence"),
    ("spam_or_phishing", "Mild Influence"),
    ("deceptive_news_or_misinformation", "Mild Influence"),
    ("legitimate_communication", "Legitimate"),
    ("legitimate_news", "Legitimate"),
]

# This dataset has no standalone urgency subtype. "Urgency Manipulation" remains in
# the 7-class label space for compatibility, but urgency-like samples are trained
# under "Fear Induction" via "fear_urgency" mapping.


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train_file", default="prepared_manipulation_dataset/train.jsonl")
    parser.add_argument(
        "--validation_file", default="prepared_manipulation_dataset/validation.jsonl"
    )
    parser.add_argument("--test_file", default="prepared_manipulation_dataset/test.jsonl")
    parser.add_argument("--model_name", default="distilbert-base-uncased")
    parser.add_argument("--output_dir", default="models/7class_distilbert")
    parser.add_argument("--max_length", type=int, default=512)
    parser.add_argument("--num_train_epochs", type=float, default=4.0)
    parser.add_argument("--learning_rate", type=float, default=2e-5)
    parser.add_argument("--weight_decay", type=float, default=0.01)
    parser.add_argument("--warmup_ratio", type=float, default=0.1)
    parser.add_argument("--gradient_accumulation_steps", type=int, default=1)
    parser.add_argument("--early_stopping_patience", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--per_device_train_batch_size", type=int, default=None)
    parser.add_argument("--per_device_eval_batch_size", type=int, default=None)
    return parser.parse_args()


def normalize_tag(value: str) -> str:
    text = str(value).strip().lower()
    text = text.replace("-", "_").replace(" ", "_")
    return "_".join(part for part in text.split("_") if part)


def parse_label_multi(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [normalize_tag(v) for v in value]
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        # JSONL may store as serialized list.
        if text.startswith("[") and text.endswith("]"):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    return [normalize_tag(v) for v in parsed]
            except json.JSONDecodeError:
                # Fall through to single-token parse.
                pass
        return [normalize_tag(text)]
    return []


def map_label_multi_to_7class(label_multi) -> Optional[str]:
    tags = parse_label_multi(label_multi)
    if not tags:
        return None

    for source_tag, target_label in PRIORITY_MAPPING:
        if source_tag in tags:
            return target_label
    return None


def normalize_row(example: Dict) -> Dict:
    text = example.get("text")
    if text is None or not str(text).strip():
        subject = str(example.get("subject", "") or "").strip()
        body = str(example.get("body", "") or "").strip()
        text = f"{subject}\n{body}".strip() if subject else body
    else:
        text = str(text).strip()

    mapped_label = map_label_multi_to_7class(example.get("label_multi"))
    if mapped_label is None:
        return {"text": text, "label": -1, "label_name": "UNMAPPED"}

    return {"text": text, "label": LABEL2ID[mapped_label], "label_name": mapped_label}


def is_valid_row(example: Dict) -> bool:
    return bool(example["text"]) and example["label"] in set(ID2LABEL.keys())


def suggest_train_batch_size() -> int:
    if torch.cuda.is_available():
        mem_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        if mem_gb >= 24:
            return 16
        if mem_gb >= 12:
            return 8
        return 4
    return 4


def compute_class_weights(train_labels: np.ndarray, n_classes: int) -> torch.Tensor:
    """
    Balanced class weights over full label space.
    Missing classes get zero weight.
    """
    counts = np.bincount(train_labels, minlength=n_classes).astype(float)
    total = counts.sum()
    weights = np.zeros(n_classes, dtype=np.float32)

    for idx, cnt in enumerate(counts):
        if cnt > 0:
            weights[idx] = total / (n_classes * cnt)
        else:
            weights[idx] = 0.0
    return torch.tensor(weights, dtype=torch.float)


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    acc = accuracy_score(labels, preds)
    macro_f1 = f1_score(labels, preds, average="macro", zero_division=0)
    weighted_f1 = f1_score(labels, preds, average="weighted", zero_division=0)

    per_class_f1 = f1_score(
        labels,
        preds,
        labels=list(range(len(LABELS))),
        average=None,
        zero_division=0,
    )
    per_class_f1_payload = {LABELS[i]: float(per_class_f1[i]) for i in range(len(LABELS))}

    return {
        "accuracy": float(acc),
        "macro_f1": float(macro_f1),
        "weighted_f1": float(weighted_f1),
        "per_class_f1": per_class_f1_payload,
    }


class WeightedTrainer(Trainer):
    def __init__(self, *args, class_weights: Optional[torch.Tensor] = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.class_weights = class_weights

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.get("labels")
        outputs = model(**inputs)
        logits = outputs.get("logits")
        if self.class_weights is not None:
            loss_fct = nn.CrossEntropyLoss(weight=self.class_weights.to(logits.device))
        else:
            loss_fct = nn.CrossEntropyLoss()
        loss = loss_fct(logits.view(-1, model.config.num_labels), labels.view(-1))
        return (loss, outputs) if return_outputs else loss


def main() -> None:
    args = parse_args()
    set_seed(args.seed)
    Path(args.output_dir).mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

    data_files = {
        "train": args.train_file,
        "validation": args.validation_file,
        "test": args.test_file,
    }
    raw: DatasetDict = load_dataset("json", data_files=data_files)

    normalized = raw.map(normalize_row)
    normalized = normalized.filter(is_valid_row)

    train_labels = np.array(normalized["train"]["label"], dtype=np.int64)
    class_weights_t = compute_class_weights(train_labels, n_classes=len(LABELS))

    tokenizer = AutoTokenizer.from_pretrained(args.model_name, use_fast=True)

    def tokenize_fn(batch):
        return tokenizer(batch["text"], truncation=True, max_length=args.max_length)

    tokenized = normalized.map(tokenize_fn, batched=True, desc="Tokenizing")
    tokenized = tokenized.rename_column("label", "labels")

    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name, num_labels=len(LABELS)
    )
    model.config.id2label = ID2LABEL
    model.config.label2id = LABEL2ID

    train_bs = args.per_device_train_batch_size or suggest_train_batch_size()
    eval_bs = args.per_device_eval_batch_size or max(4, train_bs * 2)
    fp16 = torch.cuda.is_available()

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        do_train=True,
        do_eval=True,
        do_predict=True,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="eval_macro_f1",
        greater_is_better=True,
        logging_strategy="steps",
        logging_steps=100,
        report_to="none",
        learning_rate=args.learning_rate,
        weight_decay=args.weight_decay,
        warmup_ratio=args.warmup_ratio,
        num_train_epochs=args.num_train_epochs,
        per_device_train_batch_size=train_bs,
        per_device_eval_batch_size=eval_bs,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        fp16=fp16,
        dataloader_num_workers=2,
        dataloader_pin_memory=torch.cuda.is_available(),
        seed=args.seed,
    )

    trainer = WeightedTrainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        processing_class=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer=tokenizer),
        compute_metrics=compute_metrics,
        class_weights=class_weights_t,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=args.early_stopping_patience)],
    )

    trainer.train()
    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)

    test_outputs = trainer.predict(tokenized["test"], metric_key_prefix="test")
    test_metrics = test_outputs.metrics

    y_true = test_outputs.label_ids
    y_pred = np.argmax(test_outputs.predictions, axis=-1)
    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(LABELS))))

    metrics_dir = Path("models/7class_distilbert")
    metrics_dir.mkdir(parents=True, exist_ok=True)

    cm_payload = {
        "labels": LABELS,
        "matrix": cm.tolist(),
    }

    report = classification_report(
        y_true,
        y_pred,
        labels=list(range(len(LABELS))),
        target_names=LABELS,
        zero_division=0,
        digits=4,
    )

    with (metrics_dir / "confusion_matrix_test.json").open("w", encoding="utf-8") as f:
        json.dump(cm_payload, f, indent=2)
    with (metrics_dir / "metrics_test.json").open("w", encoding="utf-8") as f:
        json.dump(test_metrics, f, indent=2)
    with (metrics_dir / "classification_report_test.txt").open("w", encoding="utf-8") as f:
        f.write(report + "\n")

    test_counts = np.bincount(y_true, minlength=len(LABELS))
    urgency_idx = LABEL2ID["Urgency Manipulation"]
    if int(test_counts[urgency_idx]) == 0:
        print(
            "WARNING: 'Urgency Manipulation' has 0 test support in this dataset. "
            "This is expected with current label mapping."
        )

    print("\nTest label support:")
    for i, label in enumerate(LABELS):
        print(f"  {label}: {int(test_counts[i])}")

    print("\nSaved model to:", Path(args.output_dir).resolve())
    print("Saved test artifacts to:", metrics_dir.resolve())


if __name__ == "__main__":
    main()
