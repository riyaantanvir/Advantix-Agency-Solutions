import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Message = {
  role: "assistant" | "user";
  content: string;
};

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm the Advantix AI assistant. How can I help you today?" }
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput("");

    const conversationHistory = messages.map(m => ({ role: m.role, content: m.content }));
    const updatedMessages: Message[] = [...messages, { role: "user", content: userMessage }];
    setMessages(updatedMessages);

    const assistantPlaceholderIndex = updatedMessages.length;
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, conversationHistory }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("Stream request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload) as { token?: string; error?: string };
            if (parsed.error) {
              accumulated = "Sorry, I'm having trouble connecting right now. Please try again later.";
            } else if (parsed.token) {
              accumulated += parsed.token;
            }
            setMessages(prev => {
              const next = [...prev];
              next[assistantPlaceholderIndex] = { role: "assistant", content: accumulated };
              return next;
            });
          } catch {
            // skip malformed events
          }
        }
      }

      if (!accumulated) {
        setMessages(prev => {
          const next = [...prev];
          next[assistantPlaceholderIndex] = { role: "assistant", content: "I'm sorry, I couldn't process your request." };
          return next;
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setMessages(prev => {
        const next = [...prev];
        next[assistantPlaceholderIndex] = { role: "assistant", content: "Sorry, I'm having trouble connecting right now. Please try again later." };
        return next;
      });
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col w-[320px] sm:w-[380px] h-[500px] mb-4"
          >
            {/* Header */}
            <div className="bg-primary px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary-foreground">
                <Bot className="w-5 h-5" />
                <span className="font-semibold font-display tracking-tight">Advantix Assistant</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`flex gap-2 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      msg.role === "user" ? "bg-secondary" : "bg-primary/20 text-primary"
                    }`}>
                      {msg.role === "user" ? <User size={16} /> : <Bot size={16} />}
                    </div>
                    <div className={`px-4 py-2 rounded-2xl text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-secondary text-secondary-foreground rounded-tl-none"
                    }`}>
                      {msg.content}
                      {isStreaming && idx === messages.length - 1 && msg.role === "assistant" && (
                        <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse align-middle" />
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {isStreaming && messages[messages.length - 1]?.content === "" && (
                <div className="flex justify-start">
                  <div className="flex gap-2 max-w-[85%]">
                    <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                      <Bot size={16} />
                    </div>
                    <div className="px-4 py-3 rounded-2xl rounded-tl-none bg-secondary text-secondary-foreground flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 bg-background border-t border-border">
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="flex items-center gap-2"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question..."
                  className="rounded-full border-border bg-secondary/50 focus-visible:ring-primary/50"
                  disabled={isStreaming}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="rounded-full shrink-0"
                  disabled={!input.trim() || isStreaming}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-shadow"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </motion.button>
    </div>
  );
}
