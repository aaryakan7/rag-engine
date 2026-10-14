"use client";

import { useRef, useState } from "react";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

type Citation = { document: string; page: number | string };
type ChatMessage = { role: "user" | "ai"; content: string; citations?: Citation[] };

async function requestApi<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload.detail === "string" ? payload.detail : `Request failed (${response.status}).`;
    throw new Error(detail);
  }
  return payload as T;
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    dragDepth.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    if (dragDepth.current === 0) return;
    dragDepth.current -= 1;
    if (dragDepth.current === 0) setIsDragging(false);
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setChatHistory((previous) => [...previous, { role: "ai", content: "Please upload a PDF document." }]);
      return;
    }

    setIsLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await requestApi<{ message: string }>("/upload", { method: "POST", body: formData });
      setChatHistory((previous) => [...previous, {
        role: "ai",
        content: `Successfully added '${file.name}' to the searchable document collection.`,
      }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown upload error.";
      setChatHistory((previous) => [...previous, { role: "ai", content: `Upload failed: ${message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const askQuestion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!question.trim()) return;
    const userQuestion = question;
    const newChat: ChatMessage[] = [...chatHistory, { role: "user", content: userQuestion }];
    setChatHistory(newChat);
    setQuestion("");
    setIsLoading(true);
    try {
      const data = await requestApi<{ answer: string; citations: Citation[] }>("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userQuestion }),
      });
      setChatHistory([...newChat, { role: "ai", content: data.answer, citations: data.citations }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown query error.";
      setChatHistory([...newChat, { role: "ai", content: `Query failed: ${message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main
      className={`flex min-h-screen flex-col items-center p-12 transition-colors duration-300 ${isDragging ? "bg-blue-50" : "bg-gray-50"} font-sans text-gray-900`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 m-4 flex items-center justify-center rounded-xl border-8 border-dashed border-blue-500 bg-blue-500/10">
          <h2 className="rounded-2xl bg-white p-8 text-4xl font-bold text-blue-600 shadow-lg">Drop PDF to Ingest</h2>
        </div>
      )}

      <div className="relative w-full max-w-4xl rounded-2xl border border-gray-100 bg-white p-8 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Local RAG Engine</h1>
          <span className="rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs text-gray-500">Drag and drop PDF enabled</span>
        </div>
        <p className="mb-8 border-b pb-4 text-gray-500">Ask questions across your local PDF collection.</p>

        <div className="mb-8 flex h-[500px] flex-col space-y-4 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4">
          {chatHistory.length === 0 ? (
            <div className="my-auto flex flex-col items-center gap-2 text-center">
              <p className="text-gray-400">Ready to query.</p>
              <p className="rounded-md border border-gray-100 bg-white px-3 py-1 text-xs text-gray-400 shadow-sm">Drop a PDF anywhere on this page to add it to the collection.</p>
            </div>
          ) : (
            chatHistory.map((message, index) => (
              <div key={index} className={`max-w-[80%] rounded-lg p-4 ${message.role === "user" ? "ml-auto self-end bg-blue-600 text-white" : "self-start border border-gray-200 bg-white shadow-sm"}`}>
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                {message.citations && message.citations.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500">
                    <span className="font-semibold">Sources:</span>
                    {message.citations.map((citation, citationIndex) => (
                      <span key={`${citation.document}-${citation.page}-${citationIndex}`} className="rounded-md bg-gray-100 px-2 py-1">
                        {citation.document}, pg. {citation.page}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && <div className="self-start animate-pulse rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500 shadow-sm">Processing...</div>}
        </div>

        <form onSubmit={askQuestion} className="flex gap-4">
          <input
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a question about your documents..."
            className="flex-1 rounded-xl border border-gray-300 p-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !question.trim()} className="rounded-xl bg-blue-600 px-8 py-4 font-medium text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-blue-300">
            Query
          </button>
        </form>
      </div>
    </main>
  );
}
