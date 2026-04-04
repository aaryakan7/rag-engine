"use client";

import { useState } from "react";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string; citations?: number[] }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // --- Drag and Drop Handlers ---
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    if (file.type !== "application/pdf") {
      setChatHistory(prev => [...prev, { role: "ai", content: "⚠️ Error: Please upload a valid PDF document." }]);
      return;
    }

    // Start the upload process
    setIsLoading(true);
    setChatHistory(prev => [...prev, { role: "ai", content: `📥 Uploading and vectorizing '${file.name}'... (This may take a minute)` }]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://127.0.0.1:8000/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setChatHistory(prev => [...prev, { role: "ai", content: `✅ Success! '${file.name}' has been embedded into the AI database. You can now query it.` }]);
      } else {
        const errorData = await res.json();
        setChatHistory(prev => [...prev, { role: "ai", content: `❌ Error: ${errorData.detail}` }]);
      }
    } catch (error) {
      setChatHistory(prev => [...prev, { role: "ai", content: `❌ Network error while uploading. Ensure your backend is running.` }]);
    }
    setIsLoading(false);
  };

  // --- Query Handler ---
  const askQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    const newChat = [...chatHistory, { role: "user", content: question }];
    setChatHistory(newChat);
    setQuestion("");
    setIsLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: newChat[newChat.length - 1].content }),
      });

      const data = await res.json();
      setChatHistory([...newChat, { role: "ai", content: data.answer, citations: data.cited_pages }]);
    } catch (error) {
      setChatHistory([...newChat, { role: "ai", content: "Error connecting to the backend engine." }]);
    }
    setIsLoading(false);
  };

  return (
    <main 
      className={`flex min-h-screen flex-col items-center p-12 transition-colors duration-300 ${isDragging ? "bg-blue-50" : "bg-gray-50"} font-sans text-gray-900`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Visual Overlay when dragging */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-500 bg-opacity-10 border-8 border-blue-500 border-dashed pointer-events-none rounded-xl m-4">
          <h2 className="text-4xl font-bold text-blue-600 animate-pulse bg-white p-8 rounded-2xl shadow-lg">Drop PDF to Ingest</h2>
        </div>
      )}

      <div className="w-full max-w-4xl bg-white shadow-xl rounded-2xl p-8 border border-gray-100 relative">
        <div className="flex justify-between items-center mb-2">
            <h1 className="text-3xl font-bold">Enterprise RAG Engine</h1>
            <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full border border-gray-200">Drag & Drop PDF Enabled</span>
        </div>
        <p className="text-gray-500 mb-8 border-b pb-4">Secure, cited document intelligence.</p>

        <div className="flex flex-col space-y-4 mb-8 h-[500px] overflow-y-auto p-4 bg-gray-50 rounded-xl border border-gray-200">
          {chatHistory.length === 0 ? (
            <div className="text-center mt-auto mb-auto flex flex-col items-center gap-2">
                <p className="text-gray-400">Ready to query.</p>
                <p className="text-xs text-gray-400 bg-white px-3 py-1 rounded-md border border-gray-100 shadow-sm">Drag any PDF anywhere on this page to update the AI's knowledge.</p>
            </div>
          ) : (
            chatHistory.map((msg, index) => (
              <div key={index} className={`p-4 rounded-lg max-w-[80%] ${msg.role === "user" ? "bg-blue-600 text-white self-end ml-auto" : "bg-white border border-gray-200 self-start shadow-sm"}`}>
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2 text-xs text-gray-500">
                    <span className="font-semibold">Cited Pages:</span>
                    {msg.citations.map((page, i) => (
                      <span key={i} className="bg-gray-100 px-2 py-1 rounded-md">pg. {page}</span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && !isDragging && (
            <div className="self-start text-sm text-gray-500 animate-pulse bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              Processing...
            </div>
          )}
        </div>

        <form onSubmit={askQuestion} className="flex gap-4">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about the document..."
            className="flex-1 p-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !question.trim()}
            className="bg-blue-600 text-white px-8 py-4 rounded-xl font-medium hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
          >
            Query
          </button>
        </form>
      </div>
    </main>
  );
}
