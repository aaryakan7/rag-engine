from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from langchain_classic.chains import RetrievalQA
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_ollama import OllamaLLM
from pydantic import BaseModel, Field

from rag_engine import (
    DATA_DIR,
    build_vector_db,
    get_embeddings,
    load_active_index,
    publish_active_index,
)

logger = logging.getLogger(__name__)
MAX_UPLOAD_BYTES = int(os.getenv("RAG_MAX_UPLOAD_BYTES", 20 * 1024 * 1024))
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("RAG_ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]


class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)


embeddings: HuggingFaceEmbeddings | None = None
qa_chain: RetrievalQA | None = None
index_lock = asyncio.Lock()


def make_qa_chain(db: FAISS) -> RetrievalQA:
    retriever = db.as_retriever(search_kwargs={"k": 3})
    return RetrievalQA.from_chain_type(
        llm=OllamaLLM(model=os.getenv("RAG_OLLAMA_MODEL", "llama3.2")),
        chain_type="stuff",
        retriever=retriever,
        return_source_documents=True,
    )


def load_runtime() -> tuple[HuggingFaceEmbeddings, RetrievalQA | None]:
    model = get_embeddings()
    db = load_active_index(model)
    return model, make_qa_chain(db) if db is not None else None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global embeddings, qa_chain
    embeddings, qa_chain = await run_in_threadpool(load_runtime)
    if qa_chain is None:
        logger.info("No FAISS index found; upload PDFs to initialize the RAG engine.")
    yield


app = FastAPI(title="Local RAG API", version="1.1", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/")
async def root():
    return {"message": "Local single-user RAG backend is running."}


def index_all_pdfs() -> RetrievalQA:
    if embeddings is None:
        raise RuntimeError("Embedding model is not initialized.")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    pdf_paths = list(DATA_DIR.glob("*.pdf")) + list(DATA_DIR.glob("*.PDF"))
    db, version_path = build_vector_db(pdf_paths, embeddings)
    candidate_chain = make_qa_chain(db)
    publish_active_index(version_path)
    return candidate_chain


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    original_name = Path((file.filename or "").replace("\\", "/")).name
    if not original_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    stored_path = DATA_DIR / f"{uuid4().hex}__{original_name}"
    size = 0
    try:
        header = await file.read(5)
        if header != b"%PDF-":
            raise HTTPException(status_code=400, detail="The uploaded file is not a valid PDF.")
        with stored_path.open("wb") as destination:
            destination.write(header)
            size += len(header)
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"PDF exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MiB upload limit.",
                    )
                destination.write(chunk)

        async with index_lock:
            candidate_chain = await run_in_threadpool(index_all_pdfs)
            global qa_chain
            qa_chain = candidate_chain
        return {"message": f"Successfully ingested {original_name}"}
    except HTTPException:
        stored_path.unlink(missing_ok=True)
        raise
    except Exception as exc:
        stored_path.unlink(missing_ok=True)
        logger.exception("PDF ingestion failed")
        if isinstance(exc, ValueError):
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        raise HTTPException(status_code=500, detail="PDF ingestion failed. Check backend logs.") from exc
    finally:
        await file.close()


@app.post("/ask")
async def ask_question(request: QueryRequest):
    chain = qa_chain
    if chain is None:
        raise HTTPException(status_code=503, detail="AI engine is not initialized or no PDF is indexed.")

    try:
        response = await run_in_threadpool(chain.invoke, {"query": request.question})
        citations = []
        for document in response["source_documents"]:
            name = document.metadata.get("document_name", "Unknown document")
            page = document.metadata.get("page")
            citation = {"document": name, "page": page + 1 if isinstance(page, int) else "Unknown"}
            if citation not in citations:
                citations.append(citation)
        return {"question": request.question, "answer": response["result"], "citations": citations}
    except Exception as exc:
        logger.exception("Question processing failed")
        raise HTTPException(status_code=500, detail="Question processing failed. Check backend logs.") from exc
