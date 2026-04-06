import { motion } from "framer-motion";
import { useListTeamMembers } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Linkedin, Mail, ArrowRight } from "lucide-react";

const expo = [0.22, 1, 0.36, 1] as const;

const grid = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};
const card = {
  hidden: { opacity: 0, y: 40, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: expo } },
};

export default function Team() {
  const { data: teamMembers, isLoading } = useListTeamMembers();

  return (
    <div className="min-h-screen bg-[#07080c]">
      {/* Section */}
      <section className="relative pt-32 pb-24 bg-[#0d0f17]">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4/5 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />

        <div className="max-w-[1200px] mx-auto px-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: expo }}
            className="text-center mb-16"
          >
            <span className="inline-block text-xs font-semibold uppercase tracking-[0.15em] text-violet-400 mb-4 px-4 py-1.5 bg-violet-500/10 border border-violet-500/15 rounded-full">
              The Minds Behind the Magic
            </span>
            <h2 className="font-display text-4xl md:text-5xl font-extrabold leading-tight tracking-tight mb-5 text-[#f1f5f9]">
              Meet Our{" "}
              <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
                Dream Team
              </span>
            </h2>
            <p className="text-[#94a3b8] text-lg max-w-[680px] mx-auto leading-relaxed">
              Every great project starts with the right people. Our team is a carefully assembled crew of
              multi-talented professionals — each one an expert in their domain, all united by a shared
              passion for delivering outstanding results.
            </p>
          </motion.div>

          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-[#111422] rounded-[20px] overflow-hidden border border-white/5">
                  <Skeleton className="aspect-square w-full rounded-none bg-white/5" />
                  <div className="p-6 space-y-3">
                    <Skeleton className="h-6 w-3/4 bg-white/5" />
                    <Skeleton className="h-4 w-1/2 bg-white/5" />
                    <Skeleton className="h-16 w-full bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <motion.div
              variants={grid}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
            >
              {teamMembers?.map((member) => (
                <motion.div
                  key={member.id}
                  variants={card}
                  whileHover={{ y: -10 }}
                  transition={{ type: "spring", stiffness: 260, damping: 22 }}
                  className="group relative bg-[#111422] border border-white/[0.06] rounded-[20px] overflow-hidden cursor-default
                             hover:border-violet-500/30 hover:shadow-[0_0_60px_rgba(139,92,246,0.15)] transition-all duration-400"
                >
                  {/* Glow on hover */}
                  <div className="absolute -top-[100px] left-1/2 -translate-x-1/2 w-[200px] h-[200px] rounded-full bg-violet-500/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none" />

                  {/* Image */}
                  <div className="relative w-full aspect-square overflow-hidden">
                    {member.photoUrl ? (
                      <img
                        src={member.photoUrl}
                        alt={member.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-900/30 to-indigo-900/20">
                        <span className="text-7xl font-display font-black text-white/10">
                          {member.name.split(" ").map(n => n[0]).join("")}
                        </span>
                      </div>
                    )}
                    {/* Image overlay gradient */}
                    <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#111422] to-transparent" />

                    {/* Badge */}
                    {member.badge && (
                      <div className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg">
                        {member.badge}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="relative p-6 z-10">
                    <h3 className="font-display text-xl font-bold text-[#f1f5f9] mb-1 group-hover:text-violet-300 transition-colors duration-200">
                      {member.name}
                    </h3>
                    <p className="text-violet-400 font-semibold text-sm mb-4">{member.role}</p>

                    {/* Skill tags */}
                    {member.skills && member.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {member.skills.slice(0, 4).map((skill) => (
                          <span
                            key={skill}
                            className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/5 border border-white/8 text-[#94a3b8]"
                          >
                            {skill}
                          </span>
                        ))}
                        {member.skills.length > 4 && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-violet-500/10 border border-violet-500/15 text-violet-400">
                            +{member.skills.length - 4} more
                          </span>
                        )}
                      </div>
                    )}

                    {member.bio && (
                      <p className="text-sm text-[#64748b] leading-relaxed line-clamp-3 mb-5">{member.bio}</p>
                    )}

                    {/* Footer row */}
                    <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
                      <div className="flex gap-2">
                        {member.linkedinUrl && (
                          <a
                            href={member.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[#64748b] hover:bg-violet-500/20 hover:text-violet-400 transition-colors"
                          >
                            <Linkedin size={14} />
                          </a>
                        )}
                        {member.email && (
                          <a
                            href={`mailto:${member.email}`}
                            className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[#64748b] hover:bg-violet-500/20 hover:text-violet-400 transition-colors"
                          >
                            <Mail size={14} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </section>
    </div>
  );
}
