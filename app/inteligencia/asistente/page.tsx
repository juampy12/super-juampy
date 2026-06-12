"use client";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useProactiveAlert } from "@/lib/useProactiveAlert";

type Message = {
  role: "user" | "assistant";
  content: string;
};

function getSugerencias(hour: number, hasAlert: boolean): string[] {
  if (hasAlert) return [
    "¿Qué alertas hay hoy?",
    "¿Qué productos tengo que pedir?",
    "¿Cómo está el stock?",
    "Resumí la situación del negocio",
    "¿Cuánto vendimos ayer?",
    "¿Qué ofertas tenemos activas?",
  ];
  if (hour < 10) return [
    "¿Cómo fue ayer?",
    "¿Cómo arrancó la mañana?",
    "¿Qué productos tienen stock bajo?",
    "¿Cuál fue el producto más vendido ayer?",
    "¿Cómo van las ventas este mes?",
    "¿Qué ofertas tenemos activas?",
  ];
  if (hour >= 18) return [
    "¿Cómo vamos hoy?",
    "¿Qué vendimos esta tarde?",
    "¿Cuánto falta para cerrar bien el día?",
    "¿Cuál fue el producto más vendido hoy?",
    "¿Cómo está el stock?",
    "Resumí el día de hoy",
  ];
  return [
    "¿Cuánto vendimos hoy?",
    "¿Cuál es el producto más vendido esta semana?",
    "¿Qué sucursal vendió más?",
    "¿Qué productos tienen stock bajo?",
    "¿Cuál es el ticket promedio de hoy?",
    "¿Cómo van las ventas este mes?",
  ];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
    >
      {copied ? "✓ Copiado" : "Copiar"}
    </button>
  );
}

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
  const [alertWasShown, setAlertWasShown] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const proactiveInjected = useRef(false);
  const { message: proactiveMsg, clear: clearProactive } = useProactiveAlert();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!proactiveMsg || proactiveInjected.current) return;
    proactiveInjected.current = true;
    setAlertWasShown(true);
    setMessages((prev) => [...prev, { role: "assistant", content: proactiveMsg }]);
    clearProactive();
  }, [proactiveMsg, clearProactive]);

  async function sendMessage(question: string) {
    if (!question.trim() || loading) return;
    const userMsg: Message = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    try {
      const history = messages.slice(-10);
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
        signal: controller.signal,
      });
      const json = await res.json();
      const assistantMsg: Message = {
        role: "assistant",
        content: json.response ?? json.error ?? "Error al procesar la consulta.",
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e: any) {
      const content = e?.name === "AbortError"
        ? "La consulta tardó demasiado (30 s). Intentá de nuevo."
        : "Error de conexión. Intentá de nuevo.";
      setMessages((prev) => [...prev, { role: "assistant", content }]);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  const hourAR = parseInt(
    new Intl.DateTimeFormat("en", { timeZone: "America/Argentina/Cordoba", hour: "numeric", hour12: false }).format(new Date()),
    10
  );
  const sugerencias = getSugerencias(hourAR, alertWasShown);

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
                ? (
                  <>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                    <CopyButton text={msg.content} />
                  </>
                )
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
      {!messages.some(m => m.role === "user") && (
        <div className="flex flex-wrap gap-2 mb-3">
          {sugerencias.map((s) => (
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
