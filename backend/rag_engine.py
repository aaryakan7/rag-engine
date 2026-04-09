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

    if len(docs) == 0:
        raise ValueError("No readable text found. If this is a scanned image or handwritten notes, it requires an OCR (Optical Character Recognition) pipeline.")
    
    print("Generating embeddings and building FAISS database...")
    db = FAISS.from_documents(docs, embeddings)
    db.save_local(DB_FAISS_PATH)
    print(f"Success! Vector database saved to {DB_FAISS_PATH}.")

if __name__ == "__main__":
    # If run manually, scan the data folder and process ANY pdf it finds
    data_dir = "data"
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
        print("Created 'data' directory. Drop PDFs here.")
    else:
        pdf_files = [f for f in os.listdir(data_dir) if f.endswith('.pdf')]
        if not pdf_files:
            print("No PDFs found in the 'data' directory.")
        else:
            for pdf in pdf_files:
                create_vector_db(os.path.join(data_dir, pdf))
