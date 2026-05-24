"use client";
import { useState, useRef, useEffect } from "react";

type Message = { role: "user" | "assistant"; content: string };

export default function AIChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "¡Hola! Soy el asistente de Super Juampy. ¿En qué te ayudo?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      const saved = localStorage.getItem("ai_chat_pos");
      if (saved) {
        setPos(JSON.parse(saved));
      } else {
        setPos({ x: window.innerWidth - 80, y: window.innerHeight - 100 });
      }
      initialized.current = true;
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragOffset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
    setDragging(true);
  }

  useEffect(() => {
    if (!dragging) return;
    function onMouseMove(e: MouseEvent) {
      const newX = Math.max(8, Math.min(window.innerWidth - 64, e.clientX - dragOffset.current.x));
      const newY = Math.max(80, Math.min(window.innerHeight - 64, e.clientY - dragOffset.current.y));
      setPos({ x: newX, y: newY });
    }
    function onMouseUp() {
      setDragging(false);
      setPos(prev => {
        localStorage.setItem("ai_chat_pos", JSON.stringify(prev));
        return prev;
      });
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging]);

  async function send(question: string) {
    if (!question.trim() || loading) return;
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
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

  if (!initialized.current) return null;

  // Panel de chat — aparece arriba del botón
  const panelLeft = pos.x + 56 > window.innerWidth - 360 ? pos.x - 350 : pos.x;
  const panelBottom = window.innerHeight - pos.y;

  return (
    <>
      {open && (
        <div
          className="fixed z-[9998] w-[350px] max-h-[500px] bg-white rounded-2xl shadow-2xl border flex flex-col overflow-hidden"
          style={{ left: panelLeft, bottom: panelBottom + 8 }}
        >
          <div className="bg-[#c1674a] text-white px-4 py-3 flex items-center justify-between">
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
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm">
                  <div className="flex gap-1">
                    {[0, 150, 300].map(d => (
                      <div key={d} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="p-3 border-t bg-white flex gap-2">
            <input
              ref={inputRef}
              className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c1674a]/30"
              placeholder="Preguntá algo..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
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

      <button
        ref={btnRef}
        onMouseDown={onMouseDown}
        onClick={() => { if (!dragging) setOpen(prev => !prev); }}
        className="fixed z-[9999] w-14 h-14 bg-[#c1674a] text-white rounded-full shadow-2xl flex items-center justify-center text-2xl hover:bg-[#a85540] select-none"
        style={{ left: pos.x, top: pos.y, cursor: dragging ? "grabbing" : "grab" }}
        title="Asistente IA — arrastrá para mover"
      >
        {open ? "✕" : "🤖"}
      </button>
    </>
  );
}
