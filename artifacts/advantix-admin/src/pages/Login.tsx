import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loginMutation = useLogin();

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" }
  });

  const onSubmit = (data: LoginForm) => {
    loginMutation.mutate(
      { data },
      {
        onSuccess: (res) => {
          if (res.success) {
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            setLocation("/dashboard");
          }
        },
        onError: () => {
          toast({
            title: "Authentication Failed",
            description: "Invalid username or password.",
            variant: "destructive",
          });
        }
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      {/* Background Image/Gradients */}
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/login-bg.png`} 
          alt="Background" 
          className="w-full h-full object-cover opacity-20 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/50 to-transparent" />
      </div>

      <div className="w-full max-w-md px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="bg-card/80 backdrop-blur-xl border border-border/50 p-8 rounded-3xl shadow-2xl shadow-black/50"
        >
          <div className="mb-8 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg shadow-primary/20">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Welcome Back</h1>
            <p className="text-muted-foreground mt-2 font-medium">Sign in to Advantix Admin</p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground ml-1">Username</label>
              <Input 
                {...form.register("username")}
                placeholder="Enter admin username"
                className="h-12 rounded-xl bg-secondary/50 border-border focus:bg-secondary transition-colors"
                disabled={loginMutation.isPending}
              />
              {form.formState.errors.username && (
                <p className="text-sm text-destructive ml-1">{form.formState.errors.username.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground ml-1">Password</label>
              <Input 
                type="password"
                {...form.register("password")}
                placeholder="Enter password"
                className="h-12 rounded-xl bg-secondary/50 border-border focus:bg-secondary transition-colors"
                disabled={loginMutation.isPending}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive ml-1">{form.formState.errors.password.message}</p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl font-bold text-lg mt-4 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 transition-all"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Authenticating...
                </>
              ) : "Sign In"}
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
