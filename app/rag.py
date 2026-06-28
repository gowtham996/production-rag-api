import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
import time
load_dotenv()

# ── Embedder and LLM — created once, reused for all requests ──
embedder = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
llm = ChatGroq(model="llama-3.3-70b-versatile")

# ── Vector store — holds all uploaded document chunks ──────────
# persist_directory saves ChromaDB to disk so data survives restarts
db = Chroma(
    embedding_function=embedder,
    persist_directory="./chroma_store"
)

# ── Prompt ─────────────────────────────────────────────────────
prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a document assistant. 
Answer the question using ONLY the context provided below.
If the answer is not in the context, say 'I could not find that in the uploaded documents.'
Always mention which part of the document your answer came from.

Context:
{context}"""),
    ("human", "{question}")
])

chain = prompt | llm


def process_pdf(file_path: str, filename: str) -> dict:
    """Load PDF, chunk it, embed it, store in ChromaDB."""
    
    # Load PDF
    loader = PyPDFLoader(file_path)
    pages = loader.load()
    
    # Add filename as metadata to each page
    for page in pages:
        page.metadata["source"] = filename
    
    # Split into chunks
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n\n", "\n", " "]
    )
    chunks = splitter.split_documents(pages)
    
    # Store in ChromaDB
    db.add_documents(chunks)
    
    return {
        "filename": filename,
        "pages": len(pages),
        "chunks": len(chunks)
    }


def ask_question(question: str) -> dict:
    """Search ChromaDB, pass context to LLM, return answer + sources + latency."""
    
    start_time = time.time()  # ← start timer
    
    # Search for relevant chunks
    relevant_docs = db.similarity_search(question, k=3)
    
    if not relevant_docs:
        return {
            "answer": "No documents uploaded yet. Please upload a PDF first.",
            "sources": [],
            "tokens_used": 0,
            "latency_ms": 0  # ← add this
        }
    
    # Build context from retrieved chunks
    context = "\n\n".join([doc.page_content for doc in relevant_docs])
    
    # Get answer from LLM
    result = chain.invoke({
        "context": context,
        "question": question
    })
    
    end_time = time.time()  # ← stop timer
    latency_ms = round((end_time - start_time) * 1000)  # convert to milliseconds
    
    # Extract source filenames
    sources = list(set([
        doc.metadata.get("source", "unknown")
        for doc in relevant_docs
    ]))
    
    return {
        "answer": result.content,
        "sources": sources,
        "tokens_used": result.usage_metadata["total_tokens"],
        "latency_ms": latency_ms  # ← new field
    }