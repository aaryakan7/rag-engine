"""Build and persist a FAISS index from the complete set of uploaded PDFs."""

from __future__ import annotations

import os
import re
from pathlib import Path
from uuid import uuid4

from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

DATA_DIR = Path(os.getenv("RAG_DATA_DIR", "data"))
VECTORSTORE_DIR = Path(os.getenv("RAG_VECTORSTORE_DIR", "vectorstore"))
ACTIVE_INDEX_FILE = VECTORSTORE_DIR / "active-index"
EMBEDDING_MODEL = os.getenv("RAG_EMBEDDING_MODEL", "all-MiniLM-L6-v2")


def get_embeddings() -> HuggingFaceEmbeddings:
    return HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)


def build_vector_db(
    pdf_paths: list[Path], embeddings: HuggingFaceEmbeddings
) -> tuple[FAISS, Path]:
    """Index all PDFs and save to a new immutable version directory."""
    if not pdf_paths:
        raise ValueError("No PDF documents are available to index.")

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
    documents = []
    for pdf_path in sorted(pdf_paths):
        loaded = PyPDFLoader(str(pdf_path)).load()
        stored_name = re.match(r"^[0-9a-f]{32}__(.*)$", pdf_path.name)
        display_name = stored_name.group(1) if stored_name else pdf_path.name
        for document in loaded:
            # Use the original filename in citations, not the generated storage name.
            document.metadata["document_name"] = display_name
        documents.extend(splitter.split_documents(loaded))

    if not documents:
        raise ValueError("No readable text found in the uploaded PDFs.")

    db = FAISS.from_documents(documents, embeddings)
    VECTORSTORE_DIR.mkdir(parents=True, exist_ok=True)
    version_name = f"index-{uuid4().hex}"
    version_path = VECTORSTORE_DIR / version_name
    db.save_local(str(version_path))
    return db, version_path


def publish_active_index(version_path: Path) -> None:
    """Atomically point startup at a fully written index version."""
    VECTORSTORE_DIR.mkdir(parents=True, exist_ok=True)
    temporary = VECTORSTORE_DIR / f".active-index-{uuid4().hex}.tmp"
    temporary.write_text(version_path.name, encoding="utf-8")
    os.replace(temporary, ACTIVE_INDEX_FILE)


def load_active_index(embeddings: HuggingFaceEmbeddings) -> FAISS | None:
    if ACTIVE_INDEX_FILE.exists():
        version_name = ACTIVE_INDEX_FILE.read_text(encoding="utf-8").strip()
        # Keep a damaged pointer from selecting a path outside the index directory.
        if not version_name or Path(version_name).name != version_name:
            raise ValueError("The active index pointer is invalid.")
        index_path = VECTORSTORE_DIR / version_name
    else:
        # Support indexes created before versioned index directories were added.
        index_path = VECTORSTORE_DIR / "db_faiss"

    if not index_path.is_dir():
        return None
    return FAISS.load_local(
        str(index_path), embeddings, allow_dangerous_deserialization=True
    )


def create_vector_db(pdf_paths: list[Path]) -> None:
    embeddings = get_embeddings()
    _, version_path = build_vector_db(pdf_paths, embeddings)
    publish_active_index(version_path)


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    pdf_files = list(DATA_DIR.glob("*.pdf")) + list(DATA_DIR.glob("*.PDF"))
    if not pdf_files:
        print(f"No PDFs found in {DATA_DIR}.")
    else:
        create_vector_db(pdf_files)
        print(f"Indexed {len(pdf_files)} PDFs from {DATA_DIR}.")
