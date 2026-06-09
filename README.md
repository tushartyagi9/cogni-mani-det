CogniGuard — Cognitive Manipulation Detection
🌐 Live Demo:
CogniGuard Live App: (https://cogni-mani-det-4.onrender.com)
CogniGuard is an AI-powered cybersecurity system designed to detect cognitive manipulation and phishing techniques in emails using a hybrid NLP pipeline combining DistilBERT and rule-based heuristic analysis.
The system identifies manipulative intent, classifies manipulation categories, generates risk scores, and provides explainable security insights for suspicious emails.
The project focuses on detecting psychological manipulation strategies such as:
Urgency Pressure
Fear Induction
Authority Exploitation
Identity Deception
Financial Manipulation
Mild Persuasion Tactics
The model achieves 98.01% accuracy with a 97.87% F1-score on a dataset of over 15,000 labeled emails.
Features
Hybrid AI + Heuristic Detection Pipeline
DistilBERT-based Email Classification
Real-time Manipulation Detection
Manipulation Risk Scoring (0–100)
Explainable AI Outputs
Multi-category Manipulation Classification
Radar-based Risk Visualization
Detailed Threat Insights
Frontend + Backend Deployment Ready
REST API Support
System Architecture
The project uses a 2-tier hybrid NLP architecture:
Tier 1 — DistilBERT Binary Classifier
Classifies emails into:
Legitimate
Manipulative
Tier 2 — Heuristic Rule Engine
Further analyzes manipulative emails into:
Fear Induction
Urgency Manipulation
Authority Exploitation
Financial Manipulation
Identity Deception
Mild Influence
The final output includes:
Binary label
Manipulation category
Manipulation score
Risk level
Detected red flags
Recommended actions
Tech Stack
Frontend
React.js
Vite
Tailwind CSS
Backend
Node.js
Express.js
AI / ML
Python
HuggingFace Transformers
DistilBERT
PyTorch
Scikit-learn
Deployment
Render
Dataset
The dataset contains 15,911 labeled emails collected from multiple sources including:
Enron Corpus
SpamAssassin
HuggingFace phishing datasets
Dataset Distribution:
Legitimate Emails: 7,199
Manipulative Emails: 8,712
Performance
Metric	Score
Accuracy	98.01%
Precision	98.43%
Recall	97.31%
F1-Score	97.87%
Manipulation Categories
Category	Example
Legitimate	"Your OTP for login is 6722"
Mild Influence	"Check our latest store offers"
Fear Induction	"Your account will be blocked"
Urgency Manipulation	"Act in 24 hours or lose access"
Authority Exploitation	"RBI here, update your KYC"
Financial Manipulation	"You won $5000 lottery"
Identity Deception	"Hi, your manager, share the OTP"
Project Structure
CogniGuard/
│
├── backend/
│   ├── routes/
│   ├── controllers/
│   ├── models/
│   ├── utils/
│   └── server.js
│
├── frontend/
│   ├── src/
│   ├── components/
│   ├── pages/
│   └── App.jsx
│
├── ml-model/
│   ├── training/
│   ├── inference/
│   └── heuristic-layer/
│
├── dataset/
├── README.md
└── package.json
Installation
Clone Repository
git clone <your-repo-url>
cd CogniGuard
Backend Setup
cd backend
npm install
npm run dev
Backend runs on:
http://localhost:5000
Frontend Setup
cd frontend
npm install
npm run dev
Frontend runs on:
http://localhost:5173
Environment Variables
Create a .env file inside frontend:
VITE_API_BASE_URL=http://localhost:5000
Create a .env file inside backend:
PORT=5000
API Endpoint
Analyze Email
POST /analyze
Request
{
  "text": "URGENT: Your SBI account has been suspended..."
}
Response
{
  "label": "Manipulative",
  "category": "Authority Exploitation",
  "score": 92,
  "risk": "High"
}
Model Pipeline
Email Preprocessing
Tokenization using DistilBERT tokenizer
Contextual embedding extraction
Binary classification
Heuristic rule matching
Risk score generation
Final explainable output
Comparative Analysis
Model	Accuracy
Naive Bayes (TF-IDF)	82.14%
Linear SVM	89.47%
BiLSTM + GloVe	91.83%
BERT-base	97.12%
DistilBERT Hybrid (Proposed)	98.01%
Future Improvements
Multilingual phishing detection
Browser extension integration
Real-time email client support
Advanced explainable AI visualizations
Enterprise-scale deployment
Adaptive continual learning
