from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaLLM
from langchain_classic.chains import RetrievalQA
import os
import shutil

# 1. Initialize FastAPI
app = FastAPI(title="Enterprise RAG API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Define what a user request looks like
class QueryRequest(BaseModel):
    question: str

# 3. Global variables to hold our AI models in memory
qa_chain = None

# 4. Load the AI components when the server starts
@app.on_event("startup")
async def startup_event():
    global qa_chain
    print("Booting up AI models...")
    
    DB_FAISS_PATH = 'vectorstore/db_faiss'
    
    if not os.path.exists(DB_FAISS_PATH):
        print("Warning: Vector DB not found. Run rag_engine.py first.")
        return

    # Load the exact same embedding model we used to chunk the PDF
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    
    # Load our database
    db = FAISS.load_local(
        DB_FAISS_PATH, 
        embeddings, 
        allow_dangerous_deserialization=True # Required for local FAISS loading
    )
    
    # Connect to local Ollama (Llama 3.2)
    llm = OllamaLLM(model="llama3.2")
    
    # Create the RAG Chain: Connect the Database to the LLM
    retriever = db.as_retriever(search_kwargs={"k": 3}) # Get top 3 most relevant chunks
    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=retriever,
        return_source_documents=True # Critical for Enterprise: Proves where the AI got the answer
    )
    print("AI Engine Ready!")

@app.get("/")
async def root():
    return {"message": "RAG Backend is running securely."}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    try:
        # 1. Ensure the data directory exists and save the file
        if not os.path.exists("data"):
            os.makedirs("data")
            
        file_path = f"data/{file.filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 2. Import existing script to chunk and vectorize the new PDF
        from rag_engine import create_vector_db
        create_vector_db(file_path)
        
        # 3. Reboot the AI models so they read the newly updated database
        await startup_event()
        
        return {"message": f"Successfully ingested {file.filename}"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# 5. The core endpoint that takes the question and returns the AI answer
@app.post("/ask")
async def ask_question(request: QueryRequest):
    if qa_chain is None:
        raise HTTPException(status_code=503, detail="AI engine is not initialized or DB is missing.")
    
    try:
        # Pass the question to the AI
        response = qa_chain.invoke({"query": request.question})
        
        # Format the output so we can see the answer AND the citations
        sources = [doc.metadata.get('page', 'Unknown') for doc in response['source_documents']]
        
        return {
            "question": request.question,
            "answer": response['result'],
            "cited_pages": sources
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
