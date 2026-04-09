#!/usr/bin/env python
"""Train a transformer classifier for manipulation detection from JSONL files.

Expected input fields:
- Primary: `text`, `label` (0/1)
- Fallback: `subject`, `body`, `label_binary`
"""

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
    precision_recall_fscore_support,
)
from sklearn.utils.class_weight import compute_class_weight
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
    set_seed,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train_file", default="prepared_manipulation_dataset/train.jsonl")
    parser.add_argument("--validation_file", default="prepared_manipulation_dataset/validation.jsonl")
    parser.add_argument("--test_file", default="prepared_manipulation_dataset/test.jsonl")
    parser.add_argument("--model_name", default="distilbert-base-uncased")
    parser.add_argument("--output_dir", default="models/manipulation_distilbert")
    parser.add_argument("--max_length", type=int, default=512)
    parser.add_argument("--num_train_epochs", type=float, default=4.0)
    parser.add_argument("--learning_rate", type=float, default=2e-5)
    parser.add_argument("--weight_decay", type=float, default=0.01)
    parser.add_argument("--warmup_ratio", type=float, default=0.1)
    parser.add_argument("--gradient_accumulation_steps", type=int, default=1)
    parser.add_argument("--early_stopping_patience", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max_train_samples", type=int, default=None)
    parser.add_argument("--max_validation_samples", type=int, default=None)
    parser.add_argument("--max_test_samples", type=int, default=None)
    parser.add_argument("--per_device_train_batch_size", type=int, default=None)
    parser.add_argument("--per_device_eval_batch_size", type=int, default=None)
    return parser.parse_args()


def _parse_label(value) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, (int, np.integer)):
        return int(value)
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        s = value.strip().lower()
        if s in {"0", "legitimate", "safe", "ham", "real"}:
            return 0
        if s in {"1", "manipulative", "spam", "phishing", "fraud", "fake"}:
            return 1
        if s.isdigit():
            return int(s)
    return None


def normalize_row(example: Dict) -> Dict:
    text = example.get("text")
    if text is None or not str(text).strip():
        subject = str(example.get("subject", "") or "").strip()
        body = str(example.get("body", "") or "").strip()
        text = f"{subject}\n{body}".strip() if subject else body
    else:
        text = str(text).strip()

    label = _parse_label(example.get("label"))
    if label is None:
        label = _parse_label(example.get("label_binary"))
    if label is None:
        label = -1

    return {"text": text, "label": label}


def is_valid_row(example: Dict) -> bool:
    return bool(example["text"]) and example["label"] in (0, 1)


def suggest_train_batch_size() -> int:
    if torch.cuda.is_available():
        mem_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        if mem_gb >= 24:
            return 16
        if mem_gb >= 12:
            return 8
        return 4
    return 4


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    acc = accuracy_score(labels, preds)
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, preds, average="binary", zero_division=0
    )
    return {
        "accuracy": float(acc),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
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

    if args.max_train_samples:
        normalized["train"] = normalized["train"].select(range(min(args.max_train_samples, len(normalized["train"]))))
    if args.max_validation_samples:
        normalized["validation"] = normalized["validation"].select(
            range(min(args.max_validation_samples, len(normalized["validation"])))
        )
    if args.max_test_samples:
        normalized["test"] = normalized["test"].select(range(min(args.max_test_samples, len(normalized["test"]))))

    train_labels = np.array(normalized["train"]["label"])
    class_weights = compute_class_weight(class_weight="balanced", classes=np.array([0, 1]), y=train_labels)
    class_weights_t = torch.tensor(class_weights, dtype=torch.float)

    tokenizer = AutoTokenizer.from_pretrained(args.model_name, use_fast=True)

    def tokenize_fn(batch):
        return tokenizer(batch["text"], truncation=True, max_length=args.max_length)

    tokenized = normalized.map(tokenize_fn, batched=True, desc="Tokenizing")
    tokenized = tokenized.rename_column("label", "labels")

    model = AutoModelForSequenceClassification.from_pretrained(args.model_name, num_labels=2)
    model.config.id2label = {0: "legitimate", 1: "manipulative"}
    model.config.label2id = {"legitimate": 0, "manipulative": 1}

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
        metric_for_best_model="eval_f1",
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

    eval_metrics = trainer.evaluate(tokenized["validation"])
    test_outputs = trainer.predict(tokenized["test"], metric_key_prefix="test")
    test_metrics = test_outputs.metrics

    y_true = test_outputs.label_ids
    y_pred = np.argmax(test_outputs.predictions, axis=-1)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    cm_payload = {
        "labels": [0, 1],
        "matrix": cm.tolist(),
        "tn": int(cm[0, 0]),
        "fp": int(cm[0, 1]),
        "fn": int(cm[1, 0]),
        "tp": int(cm[1, 1]),
    }

    report = classification_report(y_true, y_pred, target_names=["legitimate", "manipulative"], zero_division=0)
    print("\nTest Confusion Matrix (rows=true, cols=pred):")
    print(cm)
    print("\nClassification Report:")
    print(report)

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / "confusion_matrix_test.json").open("w", encoding="utf-8") as f:
        json.dump(cm_payload, f, indent=2)
    with (out_dir / "metrics_validation.json").open("w", encoding="utf-8") as f:
        json.dump(eval_metrics, f, indent=2)
    with (out_dir / "metrics_test.json").open("w", encoding="utf-8") as f:
        json.dump(test_metrics, f, indent=2)
    with (out_dir / "classification_report_test.txt").open("w", encoding="utf-8") as f:
        f.write(report + "\n")

    print(f"\nSaved model and metrics to: {out_dir.resolve()}")
    print(f"Using class weights: {class_weights.tolist()}")
    print(f"Batch sizes: train={train_bs}, eval={eval_bs}, fp16={fp16}")


if __name__ == "__main__":
    main()
