import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { X, ArrowRight } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const DISMISSED_KEY = "sticky_cta_dismissed";

type CTAConfig = {
  enabled: boolean;
  text: string;
  buttonText: string;
  buttonUrl: string;
  bg: string;
};

function isExternal(url: string) {
  return url.startsWith("http://") || url.startsWith("https://");
}

export function StickyCTABar() {
  const [config, setConfig]   = useState<CTAConfig | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;
    fetch(`${BASE}/api/settings/cta-bar`)
      .then(r => r.json())
      .then((cfg: CTAConfig) => {
        if (cfg.enabled) {
          setConfig(cfg);
          setTimeout(() => setVisible(true), 1500);
        }
      })
      .catch(() => {});
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "1");
  };

  if (!config) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 24, stiffness: 200 }}
          className="fixed bottom-0 left-0 right-0 z-[80] bg-primary border-t border-primary/30 shadow-2xl shadow-primary/20"
        >
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4 justify-between">
            <p className="text-primary-foreground text-sm font-medium flex-1 leading-snug hidden sm:block">
              {config.text}
            </p>
            <p className="text-primary-foreground text-sm font-medium flex-1 leading-snug sm:hidden line-clamp-1">
              {config.text}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {isExternal(config.buttonUrl) ? (
                <a
                  href={config.buttonUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-white text-primary font-semibold text-sm rounded-lg hover:bg-white/90 transition-colors whitespace-nowrap"
                >
                  {config.buttonText} <ArrowRight size={13} />
                </a>
              ) : (
                <Link href={config.buttonUrl} onClick={dismiss}>
                  <button className="flex items-center gap-1.5 px-4 py-2 bg-white text-primary font-semibold text-sm rounded-lg hover:bg-white/90 transition-colors whitespace-nowrap">
                    {config.buttonText} <ArrowRight size={13} />
                  </button>
                </Link>
              )}
              <button
                onClick={dismiss}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
