# Local RAG Engine

A single-user, local retrieval-augmented question-answering prototype. It accepts PDF documents, indexes their text with FAISS and `all-MiniLM-L6-v2`, and answers questions with a local Ollama model (`llama3.2` by default), including document and page citations.

Uploaded PDFs accumulate in `backend/data/`; each upload rebuilds the active FAISS index from the complete collection. The active index is published only after the replacement has been built. The backend stores generated filenames instead of trusting upload paths. This project has no user authentication, per-user collections, or hosted service protections. Keep it on a trusted local network and do not expose it as a shared service without adding authentication and collection ownership.

## Requirements

- Python 3.10 or newer and the packages in `backend/requirements.txt`
- Node.js 20 or newer and npm
- [Ollama](https://ollama.com/) with the configured model downloaded
- Internet access on first backend start to download the Hugging Face embedding model

## Run the backend

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
ollama pull llama3.2
uvicorn main:app --reload
```

The first backend start downloads `all-MiniLM-L6-v2`. The API listens on `http://localhost:8000`. Set `RAG_OLLAMA_MODEL` or `RAG_EMBEDDING_MODEL` to select different installed models. `RAG_DATA_DIR` and `RAG_VECTORSTORE_DIR` can override the default storage directories. `RAG_MAX_UPLOAD_BYTES` defaults to 20 MiB. Configure browser origins as a comma-separated `RAG_ALLOWED_ORIGINS` list; the default allows `http://localhost:3000`.

To index PDFs already in `backend/data` without starting the API, run `python rag_engine.py` from `backend/`.

## Run the frontend

In another terminal from the repository root:

```powershell
cd frontend
npm ci
$env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:8000"
npm run dev
```

Open `http://localhost:3000`. For a hosted frontend, set `NEXT_PUBLIC_API_BASE_URL` to the backend's reachable URL and set `RAG_ALLOWED_ORIGINS` on the backend to the frontend origin.

## Checks

Run the frontend quality checks from `frontend/`:

```powershell
npm run lint
npm run build
```

The frontend GitHub Actions workflow runs lint and build as separate steps. The backend requires a running Ollama service and downloaded embedding model for end-to-end ingestion and question answering.

## Example

Upload a PDF by dropping it on the page, then ask: `What are the main conclusions in this document?` If multiple PDFs are uploaded, they remain searchable together; citations include the source filename and one-based page number.
