import { motion } from "framer-motion";
import { useListTeamMembers } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Linkedin, Mail } from "lucide-react";

export default function Team() {
  const { data: teamMembers, isLoading } = useListTeamMembers();

  return (
    <div className="pt-32 pb-24 min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-6 tracking-tight">Meet The Team</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            The passionate experts, strategists, and creators behind Advantix Agency. We're dedicated to helping your business thrive.
          </p>
        </div>

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {teamMembers?.map((member, idx) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
              >
                <Card className="h-full border-border/50 bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-300 overflow-hidden group">
                  <div className="aspect-[4/5] bg-secondary relative overflow-hidden">
                    {member.photoUrl ? (
                      <img 
                        src={member.photoUrl} 
                        alt={member.name} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
                        <span className="text-6xl font-display font-bold text-muted-foreground/20">
                          {member.name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                    )}
                    
                    {/* Social Overlay */}
                    <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-background/90 to-transparent flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      {member.linkedinUrl && (
                        <a href={member.linkedinUrl} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-primary/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-primary transition-colors">
                          <Linkedin size={16} />
                        </a>
                      )}
                      {member.email && (
                        <a href={`mailto:${member.email}`} className="w-8 h-8 rounded-full bg-primary/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-primary transition-colors">
                          <Mail size={16} />
                        </a>
                      )}
                    </div>
                  </div>
                  
                  <CardContent className="p-6">
                    <h3 className="font-display font-bold text-xl mb-1 text-foreground group-hover:text-primary transition-colors">{member.name}</h3>
                    <p className="text-primary font-medium text-sm mb-4">{member.role}</p>
                    {member.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                        {member.bio}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
