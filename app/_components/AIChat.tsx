"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { getPosEmployee } from "@/lib/posSession";

type Message = { role: "user" | "assistant"; content: string };

export default function AIChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "¡Hola! Soy el asistente de Super Juampy. ¿En qué te ayudo?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState({ right: 16, bottom: 24 });
  const dragging = useRef(false);
  const startMouse = useRef({ x: 0, y: 0 });
  const startPos = useRef({ right: 16, bottom: 24 });
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const didDrag = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ai_btn_pos");
      if (saved) setPos(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    didDrag.current = false;
    startMouse.current = { x: e.clientX, y: e.clientY };
    startPos.current = { ...pos };
  }, [pos]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const dx = e.clientX - startMouse.current.x;
      const dy = e.clientY - startMouse.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
      const newRight = Math.max(8, Math.min(window.innerWidth - 64, startPos.current.right - dx));
      const newBottom = Math.max(8, Math.min(window.innerHeight - 64, startPos.current.bottom - dy));
      setPos({ right: newRight, bottom: newBottom });
    }
    function onUp() {
      if (dragging.current) {
        dragging.current = false;
        setPos(prev => {
          localStorage.setItem("ai_btn_pos", JSON.stringify(prev));
          return prev;
        });
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  async function send(question: string) {
    if (!question.trim() || loading) return;
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    try {
      const history = messages.slice(-10); // últimos 10 mensajes como contexto
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, role: getPosEmployee()?.role ?? "cashier" }),
      });
      const json = await res.json();
      setMessages(prev => [...prev, {
        role: "assistant",
        content: json.response ?? json.error ?? "Error al procesar.",
      }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error de conexión." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Panel chat — siempre arriba del botón */}
      {open && (
        <div
          className="fixed z-[9998] w-[340px] bg-white rounded-2xl shadow-2xl border flex flex-col overflow-hidden"
          style={{ right: pos.right, bottom: pos.bottom + 64 , maxHeight: "420px" }}
        >
          <div className="bg-[#c1674a] text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">🤖</span>
              <div>
                <div className="font-semibold text-sm">Asistente IA</div>
                <div className="text-xs opacity-80">Super Juampy</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-xl">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-[#c1674a] text-white rounded-br-sm"
                    : "bg-white border rounded-bl-sm shadow-sm text-gray-800"
                }`}>
                  {msg.role === "assistant"
                    ? <ReactMarkdown className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">{msg.content}</ReactMarkdown>
                    : msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border rounded-2xl px-3 py-2 shadow-sm">
                  <div className="flex gap-1">
                    {[0,150,300].map(d => (
                      <div key={d} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="p-3 border-t bg-white flex gap-2 flex-shrink-0">
            <input
              ref={inputRef}
              className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c1674a]/30"
              placeholder="Preguntá algo..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }}}
              disabled={loading}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="bg-[#c1674a] text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-[#a85540]"
            >↑</button>
          </div>
        </div>
      )}

      {/* Botón flotante arrastrable */}
      <button
        onMouseDown={onMouseDown}
        onClick={() => { if (!didDrag.current) setOpen(prev => !prev); }}
        className="fixed z-[9999] w-14 h-14 bg-[#c1674a] text-white rounded-full shadow-2xl flex items-center justify-center text-2xl select-none"
        style={{ right: pos.right, bottom: pos.bottom, cursor: "grab" }}
        title="Asistente IA — arrastrá para mover"
      >
        {open ? "✕" : "🤖"}
      </button>
    </>
  );
}
