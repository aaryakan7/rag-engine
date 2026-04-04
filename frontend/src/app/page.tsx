"use client";

import { useState } from "react";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string; citations?: number[] }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const askQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    // Add user question to UI
    const newChat = [...chatHistory, { role: "user", content: question }];
    setChatHistory(newChat);
    setQuestion("");
    setIsLoading(true);

    try {
      // Call our FastAPI backend
      const res = await fetch("http://127.0.0.1:8000/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: newChat[newChat.length - 1].content }),
      });

      const data = await res.json();

      // Add AI response to UI
      setChatHistory([
        ...newChat,
        { role: "ai", content: data.answer, citations: data.cited_pages },
      ]);
    } catch (error) {
      setChatHistory([
        ...newChat,
        { role: "ai", content: "Error connecting to the backend engine. Is Uvicorn running?" },
      ]);
    }

    setIsLoading(false);
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-12 bg-gray-50 font-sans text-gray-900">
      <div className="w-full max-w-4xl bg-white shadow-xl rounded-2xl p-8 border border-gray-100">
        <h1 className="text-3xl font-bold mb-2">Enterprise RAG Engine</h1>
        <p className="text-gray-500 mb-8 border-b pb-4">Secure, cited document intelligence.</p>

        <div className="flex flex-col space-y-4 mb-8 h-[500px] overflow-y-auto p-4 bg-gray-50 rounded-xl border border-gray-200">
          {chatHistory.length === 0 ? (
            <p className="text-gray-400 text-center mt-auto mb-auto">Ready to query your document.</p>
          ) : (
            chatHistory.map((msg, index) => (
              <div key={index} className={`p-4 rounded-lg max-w-[80%] ${msg.role === "user" ? "bg-blue-600 text-white self-end ml-auto" : "bg-white border border-gray-200 self-start shadow-sm"}`}>
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                {msg.citations && (
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
          {isLoading && (
            <div className="self-start text-sm text-gray-500 animate-pulse bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              Analyzing document chunks...
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