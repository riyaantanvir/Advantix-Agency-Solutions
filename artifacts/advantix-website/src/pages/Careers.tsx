import { SEO } from "@/components/SEO";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Trophy, Users, Calendar, Clock, ArrowRight, Briefcase,
  Star, Sparkles, ChevronRight,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Contest = {
  id: number;
  title: string;
  description: string;
  type: string;
  prize: string | null;
  coverImageUrl: string | null;
  deadline: string;
  status: string;
  isActive: boolean;
  participantCount: number;
  submissionCount: number;
  winnerSubmissionId: string | null;
  winner: { participantName: string; fileUrl: string } | null;
};

const expo = [0.22, 1, 0.36, 1] as const;

function timeLeft(deadline: string) {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h left`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m left`;
}

export default function Careers() {
  const { data: contests = [], isLoading } = useQuery<Contest[]>({
    queryKey: ["public-contests"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/contests`);
      if (!res.ok) throw new Error("Failed to load contests");
      return res.json();
    },
  });

  return (
    <>
      <SEO
        title="Careers — Advantix Digital"
        description="Join Advantix Digital. Explore open positions and participate in our design competitions."
        canonical="/careers"
      />

      <section className="relative overflow-hidden pt-32 pb-20 px-4">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/4 w-80 h-80 bg-primary/5 rounded-full blur-[100px]" />
          <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-[120px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: expo }}
          className="max-w-4xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Briefcase className="w-4 h-4" />
            We're Hiring
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Join Our <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">Creative Team</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            We're always looking for talented individuals to join Advantix Digital.
            Participate in our competitions to showcase your skills and win prizes!
          </p>
        </motion.div>
      </section>

      <section className="pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-3 mb-8"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Active Competitions</h2>
              <p className="text-sm text-muted-foreground">Participate and showcase your talent</p>
            </div>
          </motion.div>

          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-card border border-border rounded-2xl p-6 animate-pulse">
                  <div className="w-full h-40 bg-muted rounded-xl mb-4" />
                  <div className="h-5 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-4 bg-muted rounded w-full mb-4" />
                  <div className="h-8 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : contests.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20 bg-card border border-border rounded-2xl"
            >
              <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-lg font-medium text-muted-foreground">No active competitions right now</p>
              <p className="text-sm text-muted-foreground mt-2">Check back soon for new opportunities!</p>
            </motion.div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {contests.map((c, i) => {
                const isExpired = new Date(c.deadline) < new Date();
                const remaining = timeLeft(c.deadline);
                const hasWinner = !!c.winnerSubmissionId;

                return (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: i * 0.1 }}
                  >
                    <Link href={`/contests/${c.id}`}>
                      <div className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/40 hover:shadow-xl transition-all duration-300 cursor-pointer group h-full flex flex-col">
                        <div className="relative h-48 bg-gradient-to-br from-primary/20 via-purple-500/10 to-transparent overflow-hidden">
                          {c.coverImageUrl ? (
                            <img src={c.coverImageUrl} alt={c.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Trophy className="w-16 h-16 text-primary/30" />
                            </div>
                          )}
                          {hasWinner && (
                            <div className="absolute top-3 right-3 bg-amber-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                              <Star className="w-3 h-3" /> Winner Selected
                            </div>
                          )}
                          {!isExpired && !hasWinner && remaining && (
                            <div className="absolute top-3 right-3 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {remaining}
                            </div>
                          )}
                          {isExpired && !hasWinner && (
                            <div className="absolute top-3 right-3 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                              Closed
                            </div>
                          )}
                        </div>

                        <div className="p-5 flex-1 flex flex-col">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{c.type}</span>
                            {c.prize && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-medium flex items-center gap-1">
                                <Sparkles className="w-3 h-3" /> {c.prize}
                              </span>
                            )}
                          </div>
                          <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">{c.title}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{c.description}</p>

                          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" /> {c.participantCount} joined
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" /> {new Date(c.deadline).toLocaleDateString()}
                            </span>
                            <span className="ml-auto text-primary font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                              View <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
