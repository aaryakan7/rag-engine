from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
import os

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
DB_FAISS_PATH = 'vectorstore/db_faiss'

def create_vector_db(pdf_path: str):
    print(f"Loading document: {pdf_path}")
    loader = PyPDFLoader(pdf_path)
    documents = loader.load()
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
    docs = text_splitter.split_documents(documents)
    print("Generating embeddings and building FAISS database...")
    db = FAISS.from_documents(docs, embeddings)
    db.save_local(DB_FAISS_PATH)
    print(f"Success! Vector database saved to {DB_FAISS_PATH}.")

if __name__ == "__main__":
    sample_pdf = 'data/sample.pdf'
    if os.path.exists(sample_pdf):
        create_vector_db(sample_pdf)