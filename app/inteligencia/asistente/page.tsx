"use client";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { getPosEmployee } from "@/lib/posSession";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const SUGERENCIAS = [
  "¿Cuánto vendimos hoy?",
  "¿Cuál fue el producto más vendido esta semana?",
  "¿Qué sucursal vendió más?",
  "¿Qué productos tienen stock bajo?",
  "¿Cuál es el ticket promedio de hoy?",
  "¿Cómo van las ventas este mes?",
];

export default function AsistentePage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "¡Hola! Soy el asistente de Super Juampy. Podés preguntarme sobre ventas, stock, productos más vendidos, comparativas entre sucursales y más. ¿En qué te ayudo?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(question: string) {
    if (!question.trim() || loading) return;
    const userMsg: Message = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const history = messages.slice(-10);
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, role: getPosEmployee()?.role ?? "cashier" }),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: json.error ?? "Error al procesar la consulta.",
        }]);
        return;
      }

      // Agrega mensaje vacío y oculta el indicador de escritura
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      setLoading(false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
        });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error de conexión. Intentá de nuevo." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 flex flex-col h-[calc(100vh-120px)]">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">🤖 Asistente IA</h1>
        <p className="text-sm text-gray-500">
          Preguntame sobre ventas, stock, productos y más.
        </p>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-gray-900 text-white rounded-br-sm"
                  : "bg-white border rounded-bl-sm shadow-sm"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="text-xs text-gray-400 mb-1 font-medium">
                  🤖 Asistente
                </div>
              )}
              {msg.role === "assistant"
                ? <ReactMarkdown>{msg.content}</ReactMarkdown>
                : msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Sugerencias */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="text-xs border rounded-full px-3 py-1 hover:bg-gray-50 text-gray-600"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
          placeholder="Preguntá algo sobre el negocio..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          disabled={loading}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="bg-gray-900 text-white px-5 py-3 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-gray-700"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
