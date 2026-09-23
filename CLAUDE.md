# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A minimal FastAPI service implementing RAG (Retrieval-Augmented Generation) over uploaded PDFs. Users upload a PDF, it gets chunked and embedded into a local ChromaDB store, and questions are answered by retrieving relevant chunks and passing them to a Groq-hosted LLM.

The entire application is two files: `app/main.py` (FastAPI routes) and `app/rag.py` (PDF processing, embedding, retrieval, and LLM chain).

## Running

```bash
# Install dependencies (Python, using venv/ in this repo)
pip install -r requirements.txt

# Run the dev server
uvicorn app.main:app --reload

# Run as deployed (see render.yaml)
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Requires a `.env` file with `GROQ_API_KEY` set (loaded via `python-dotenv` in `app/rag.py`).

There is no test suite, linter, or build step configured in this repo.

## Architecture

- **`app/main.py`** — FastAPI app with two endpoints:
  - `POST /upload` — accepts a PDF, saves it to `uploads/`, and calls `process_pdf()`.
  - `POST /ask` — accepts a question, calls `ask_question()`, returns answer + sources + token usage + latency.
- **`app/rag.py`** — all RAG logic, built around three module-level singletons created once at import time and reused across requests:
  - `embedder`: `FastEmbedEmbeddings` (`BAAI/bge-small-en-v1.5`) — used instead of `sentence-transformers` specifically to avoid OOM on constrained deploy environments (see git history).
  - `llm`: `ChatGroq` (`llama-3.3-70b-versatile`).
  - `db`: a `Chroma` vector store persisted to `./chroma_store` on disk, so uploaded documents survive process restarts.
  - `process_pdf()`: loads a PDF with `PyPDFLoader`, tags each page with `source` metadata (the original filename), splits into chunks via `RecursiveCharacterTextSplitter` (1000 chars, 200 overlap), and adds them to `db`.
  - `ask_question()`: runs `db.similarity_search(question, k=3)`, joins the retrieved chunks into a single context block, and invokes a `ChatPromptTemplate | ChatGroq` chain that is instructed to answer only from the given context and cite which part of the document it came from. Returns answer, deduplicated source filenames, token usage, and latency in ms.

## Persistence and deploy notes

- `chroma_store/` and `uploads/` are gitignored — the vector DB and uploaded PDFs are local/instance state, not checked into the repo. On platforms without a persistent disk (e.g. the current `render.yaml` config), this data does not survive redeploys.
- Deployment target is Render (`render.yaml`): builds with `pip install -r requirements.txt`, starts with `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, and expects `GROQ_API_KEY` to be set as an environment variable in the Render dashboard (not committed).
