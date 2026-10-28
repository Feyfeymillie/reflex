import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

import { t, useLang } from "@/lib/i18n";
type Msg = { role: "user" | "bot"; text: string };

// Keywords match both languages; answers are translated through t().
const FAQ: { q: RegExp; a: string }[] = [
  { q: /preeclampsia|kifafa cha mimba|shinikizo/i, a: "Preeclampsia is high blood pressure in pregnancy. Look for BP ≥ 140/90, swelling and headaches. BP ≥ 160/110 or any danger sign means refer today." },
  { q: /referral|refer|rufaa/i, a: "Use the Referrals page. High-risk and urgent results create a referral on the hub. The hub sends no SMS: you call or escort the mother yourself." },
  { q: /offline|intaneti|mtandao/i, a: "RefleX runs on the hub's own Wi-Fi with no internet. Records stay on the hub. There is no sync to other devices yet." },
  { q: /anemia|anaemia|upungufu wa damu/i, a: "Watch for pale eyelids and palms, tiredness and Hb below 11 g/dL. Iron and folic acid every day; refer if Hb is below 7." },
  { q: /depress|huzuni|epds|sonona/i, a: "Use the Postpartum page to screen with the EPDS from 2 weeks after birth. Any answer above Never on question 10 means contact the facility today." },
  { q: /\b(hi|hello|hey|habari|mambo|hujambo)\b/i, a: "Hello! I'm MamaBot. Ask me about preeclampsia, anaemia, depression, referrals or offline mode." },
];

export function Chatbot() {
  useLang();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "bot", text: "Hi! I'm MamaBot, a simple helper with fixed answers. Ask about danger signs, referrals or offline mode." },
  ]);

  function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg) return;
    const next: Msg[] = [...msgs, { role: "user", text: msg }];
    const reply = FAQ.find((f) => f.q.test(msg))?.a ?? "I only know a few topics. For anything else, ask your supervising clinician.";
    next.push({ role: "bot", text: reply });
    setMsgs(next);
    setInput("");
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-5 right-5 z-50 size-14 rounded-full bg-gradient-hero text-white shadow-glow flex items-center justify-center hover:scale-105 transition-transform"
        aria-label={t("Open assistant")}
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>
      <div
        className={cn(
          "fixed bottom-24 right-5 z-50 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl bg-card border border-border shadow-glow overflow-hidden transition-all origin-bottom-right",
          open ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none",
        )}
      >
        <div className="bg-gradient-hero p-4 text-white">
          <div className="font-semibold">{t("MamaBot Assistant")}</div>
          <div className="text-xs opacity-90">{t("Keyword helper with fixed answers, not AI")}</div>
        </div>
        <div className="h-72 overflow-y-auto p-3 space-y-2 bg-gradient-soft">
          {msgs.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-card border border-border",
              )}
            >
              {m.role === "bot" ? t(m.text) : m.text}
            </div>
          ))}
        </div>
        <div className="p-2 border-t border-border flex items-center gap-1 bg-card">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={t("Ask MamaBot...")}
            className="flex-1 bg-transparent text-sm px-2 py-2 outline-none"
          />
          <button onClick={() => send()} className="p-2 rounded-md bg-primary text-primary-foreground hover:opacity-90">
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </>
  );
}
