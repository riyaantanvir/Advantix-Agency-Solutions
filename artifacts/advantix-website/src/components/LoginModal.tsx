import { useState } from "react";
import { useLocation } from "wouter";
import { Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LoginForm } from "@/components/LoginForm";
import { AdminLoginModal } from "@/components/AdminLoginModal";
import { useToolsUser } from "@/context/ToolsUserContext";
import type { ToolUser } from "@/lib/toolsApi";

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  const [, navigate] = useLocation();
  const { setUser } = useToolsUser();
  const [adminOpen, setAdminOpen] = useState(false);

  const handleUserSuccess = (user: ToolUser) => {
    setUser(user);
    onClose();
    navigate("/tools/dashboard");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-md p-0 border-border/60 bg-card rounded-3xl overflow-hidden shadow-2xl">
          <DialogTitle className="sr-only">Advantix Portal Login</DialogTitle>
          <DialogDescription className="sr-only">Sign in to your account or create a new one</DialogDescription>

          <div className="p-7">
            <div className="text-center mb-7">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Lock className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-2xl font-display font-extrabold">Advantix Portal</h2>
              <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
            </div>

            <LoginForm
              onUserSuccess={handleUserSuccess}
              onAdminClick={() => setAdminOpen(true)}
            />
          </div>
        </DialogContent>
      </Dialog>

      <AdminLoginModal
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        onSuccess={() => { window.location.href = "/admin/"; }}
      />
    </>
  );
}
