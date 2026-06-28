import os
import time
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from app.rag import process_pdf, ask_question

app = FastAPI(title="Production RAG API")

# Temp folder for uploaded PDFs
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── Request/Response models ────────────────────────────────────
class QuestionRequest(BaseModel):
    question: str

class QuestionResponse(BaseModel):
    answer: str
    sources: list
    tokens_used: int
    latency_ms: int  # ← add this line

# ── Endpoints ──────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "RAG API is running"}


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """Accept a PDF, process it, store in ChromaDB."""
    
    # Validate file type
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files allowed")
    
    # Save uploaded file temporarily
    file_path = f"{UPLOAD_DIR}/{file.filename}"
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    # Process the PDF
    result = process_pdf(file_path, file.filename)
    
    return {
        "message": "PDF processed successfully",
        "filename": result["filename"],
        "pages_loaded": result["pages"],
        "chunks_stored": result["chunks"]
    }


@app.post("/ask", response_model=QuestionResponse)
async def ask(request: QuestionRequest):
    """Accept a question, return answer with sources."""
    
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    
    result = ask_question(request.question)
    
    return QuestionResponse(
    answer=result["answer"],
    sources=result["sources"],
    tokens_used=result.get("tokens_used", 0),
    latency_ms=result.get("latency_ms", 0)  # ← this line is missing
)
