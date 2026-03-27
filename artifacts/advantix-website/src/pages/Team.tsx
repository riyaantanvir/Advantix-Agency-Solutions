import { motion } from "framer-motion";
import { useListTeamMembers } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Linkedin, Mail } from "lucide-react";

const expo = [0.22, 1, 0.36, 1] as const;

const grid = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const card = {
  hidden: { opacity: 0, y: 30, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: expo } },
};

export default function Team() {
  const { data: teamMembers, isLoading } = useListTeamMembers();

  return (
    <div className="pt-32 pb-24 min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: expo }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-6 tracking-tight">Meet The Team</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            The passionate experts, strategists, and creators behind Advantix Agency. We're dedicated to helping your business thrive.
          </p>
        </motion.div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="border-border/50 bg-card overflow-hidden">
                <Skeleton className="h-64 w-full rounded-none" />
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-4" />
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <motion.div
            variants={grid}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            {teamMembers?.map((member) => (
              <motion.div
                key={member.id}
                variants={card}
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 280, damping: 22 }}
              >
                <Card className="h-full border-border/50 bg-card hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 overflow-hidden group">
                  <div className="aspect-[4/5] bg-secondary relative overflow-hidden">
                    {member.photoUrl ? (
                      <img
                        src={member.photoUrl}
                        alt={member.name}
                        className="w-full h-full object-cover transition-transform duration-600 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
                        <span className="text-6xl font-display font-bold text-muted-foreground/15">
                          {member.name.split(" ").map(n => n[0]).join("")}
                        </span>
                      </div>
                    )}

                    {/* Social icons overlay */}
                    <motion.div
                      className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-background/90 to-transparent flex justify-end gap-2"
                      initial={{ opacity: 0, y: 8 }}
                      whileHover={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {member.linkedinUrl && (
                        <motion.a
                          href={member.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-8 h-8 rounded-full bg-primary/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-primary transition-colors"
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.9 }}
                        >
                          <Linkedin size={15} />
                        </motion.a>
                      )}
                      {member.email && (
                        <motion.a
                          href={`mailto:${member.email}`}
                          className="w-8 h-8 rounded-full bg-primary/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-primary transition-colors"
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.9 }}
                        >
                          <Mail size={15} />
                        </motion.a>
                      )}
                    </motion.div>
                  </div>

                  <CardContent className="p-6">
                    <h3 className="font-display font-bold text-xl mb-1 text-foreground group-hover:text-primary transition-colors duration-200">
                      {member.name}
                    </h3>
                    <p className="text-primary font-medium text-sm mb-4">{member.role}</p>
                    {member.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">{member.bio}</p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
