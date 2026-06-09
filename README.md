# CogniGuard — Cognitive Manipulation Detection

🌐 **Live Demo:**  
https://cogni-mani-det-4.onrender.com

AI-powered email manipulation and phishing detection system using **DistilBERT + Heuristic NLP Pipeline**.

---

## Features

- Detects manipulative/phishing emails
- AI-based DistilBERT classifier
- Risk score generation (0–100)
- Manipulation category detection
- Explainable threat analysis
- Real-time email analysis

---

## Manipulation Categories

- Urgency Manipulation
- Fear Induction
- Authority Exploitation
- Financial Manipulation
- Identity Deception
- Mild Influence

---

## Tech Stack

### Frontend
- React.js
- Vite
- Tailwind CSS

### Backend
- Node.js
- Express.js

### AI/ML
- Python
- DistilBERT
- HuggingFace Transformers
- PyTorch

---

## Installation

### Clone Repository

```bash
git clone <repo-url>
cd CogniGuard
```

### Backend Setup

```bash
cd backend
npm install
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

---

## Environment Variables

### Frontend `.env`

```env
VITE_API_BASE_URL=http://localhost:5000
```

### Backend `.env`

```env
PORT=5000
```

---

## API Endpoint

### Analyze Email

```http
POST /analyze
```

### Request

```json
{
  "text": "URGENT: Your SBI account has been suspended..."
}
```

### Response

```json
{
  "label": "Manipulative",
  "category": "Authority Exploitation",
  "score": 92
}
```

---

## Dataset

- 15,911 labeled emails
- Enron Corpus
- SpamAssassin
- HuggingFace phishing datasets

---
