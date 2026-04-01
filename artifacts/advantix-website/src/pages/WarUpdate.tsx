import { motion } from "framer-motion";
import { Shield } from "lucide-react";

const expo = [0.22, 1, 0.36, 1] as const;

export default function WarUpdate() {
  return (
    <div className="pt-32 pb-24 min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: expo }}
          className="text-center"
        >
          <div className="w-20 h-20 rounded-3xl bg-red-500/10 flex items-center justify-center mx-auto mb-8">
            <Shield className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-extrabold mb-5 tracking-tight">
            War Update
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed mb-10">
            Real-time conflict and war zone updates — curated, verified, and delivered fast.
          </p>

          <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full px-5 py-2 text-sm font-semibold">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            Coming Soon
          </div>
        </motion.div>
      </div>
    </div>
  );
}
